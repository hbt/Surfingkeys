/**
 * Errors List Action
 *
 * Lists all extension errors from:
 * 1. chrome.storage.local (Surfingkeys custom error collection)
 * 2. chrome://extensions/?errors=<id> page (Chrome's native errors via developerPrivate API)
 *
 * Independent implementation - does not depend on debug/ directory
 */

const WebSocket = require('ws');
const http = require('http');
const { detectExtension, sendCommand, CDP_PORT } = require('../lib/extension-utils');

// Color utilities
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m'
};

const STORAGE_KEY = 'surfingkeys_errors';
const CDP_ENDPOINT = `http://localhost:${CDP_PORT}`;

/**
 * Fetch JSON from CDP endpoint
 */
function fetchJson(path) {
    return new Promise((resolve, reject) => {
        http.get(`${CDP_ENDPOINT}${path}`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
        }).on('error', reject);
    });
}

/**
 * Find chrome://extensions/?errors=<id> tab
 */
async function findExtensionsErrorTab(extensionId) {
    const targets = await fetchJson('/json');
    const tab = targets.find(t =>
        t.type === 'page' && t.url && t.url.includes(`chrome://extensions/?errors=${extensionId}`)
    );
    return tab ? tab.webSocketDebuggerUrl : null;
}

/**
 * Evaluate code in a WebSocket context
 */
async function evaluateCode(ws, expression) {
    const result = await sendCommand(ws, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
    });

    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    }

    return result.result?.value;
}

/**
 * Format stored error for display
 */
function formatStoredError(err, idx) {
    const lines = [];
    lines.push(`${colors.bright}[${idx + 1}]${colors.reset} ${colors.yellow}${err.type}${colors.reset}`);
    lines.push(`    ${colors.cyan}Message:${colors.reset} ${err.message}`);
    lines.push(`    ${colors.cyan}Context:${colors.reset} ${err.context}`);
    lines.push(`    ${colors.cyan}Time:${colors.reset} ${err.timestamp}`);

    if (err.source) {
        lines.push(`    ${colors.cyan}Location:${colors.reset} ${err.source}:${err.lineno}:${err.colno}`);
    }

    if (err.stack) {
        const stackLines = err.stack.split('\n').slice(0, 3);
        lines.push(`    ${colors.cyan}Stack:${colors.reset}`);
        stackLines.forEach(line => {
            lines.push(`      ${colors.dim}${line.trim()}${colors.reset}`);
        });
    }

    return lines.join('\n');
}

/**
 * Format Chrome native error for display
 */
function formatChromeError(err, idx) {
    const lines = [];
    lines.push(`${colors.bright}[${idx + 1}]${colors.reset} ${colors.red}${err.severity || 'error'}${colors.reset}`);
    lines.push(`    ${colors.cyan}Message:${colors.reset} ${err.message}`);
    lines.push(`    ${colors.cyan}Source:${colors.reset} ${err.source}`);

    if (err.contextUrl) {
        lines.push(`    ${colors.cyan}Context URL:${colors.reset} ${err.contextUrl}`);
    }

    if (err.stackTrace && err.stackTrace.length > 0) {
        lines.push(`    ${colors.cyan}Stack:${colors.reset}`);
        err.stackTrace.slice(0, 5).forEach(frame => {
            const fn = frame.functionName || '(anonymous)';
            lines.push(`      ${colors.dim}at ${fn} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})${colors.reset}`);
        });
    }

    return lines.join('\n');
}

/**
 * Get Chrome native errors from chrome://extensions page
 */
async function getChromeNativeErrors(extensionId) {
    const tabWsUrl = await findExtensionsErrorTab(extensionId);

    if (!tabWsUrl) {
        return {
            available: false,
            reason: `chrome://extensions/?errors=${extensionId} tab not open`
        };
    }

    return new Promise((resolve) => {
        const ws = new WebSocket(tabWsUrl);
        const timeout = setTimeout(() => {
            ws.close();
            resolve({ available: false, reason: 'Timeout connecting to extensions page' });
        }, 5000);

        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                const result = await evaluateCode(ws, `
                    (function() {
                        return new Promise((resolve) => {
                            if (!chrome.developerPrivate || !chrome.developerPrivate.getExtensionInfo) {
                                resolve({ error: 'chrome.developerPrivate.getExtensionInfo not available' });
                                return;
                            }

                            chrome.developerPrivate.getExtensionInfo('${extensionId}', (details) => {
                                const err = chrome.runtime.lastError;
                                if (err) {
                                    resolve({ error: err.message });
                                } else {
                                    resolve({
                                        manifestErrors: details.manifestErrors || [],
                                        runtimeErrors: details.runtimeErrors || []
                                    });
                                }
                            });
                        });
                    })()
                `);

                clearTimeout(timeout);
                ws.close();

                if (result.error) {
                    resolve({ available: false, reason: result.error });
                } else {
                    resolve({
                        available: true,
                        manifestErrors: result.manifestErrors,
                        runtimeErrors: result.runtimeErrors
                    });
                }
            } catch (error) {
                clearTimeout(timeout);
                ws.close();
                resolve({ available: false, reason: error.message });
            }
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            resolve({ available: false, reason: error.message });
        });
    });
}

/**
 * Main action runner
 */
async function run(args) {
    console.log(`${colors.bright}List Extension Errors${colors.reset}\n`);

    // Detect extension (with auto-wake if dormant)
    console.log(`${colors.cyan}Detecting extension...${colors.reset}`);
    const logFn = (msg) => console.log(`  ${colors.dim}${msg}${colors.reset}`);
    const extInfo = await detectExtension(logFn);

    if (!extInfo) {
        console.error(`${colors.red}Error: Could not detect Surfingkeys extension${colors.reset}`);
        console.error(`Make sure the extension is installed and the browser is running with CDP on port ${CDP_PORT}\n`);
        process.exit(1);
    }

    const extensionId = extInfo.id;
    const swWsUrl = extInfo.wsUrl;

    console.log(`  Extension ID: ${colors.bright}${extensionId}${colors.reset}\n`);

    // Connect to service worker
    console.log(`${colors.cyan}Connecting to service worker...${colors.reset}`);

    const ws = new WebSocket(swWsUrl);

    ws.on('open', async () => {
        try {
            await sendCommand(ws, 'Runtime.enable');
            console.log(`  ${colors.green}✓ Connected${colors.reset}\n`);

            let totalErrors = 0;

            // ============================================================
            // SECTION 1: Chrome Native Errors (from chrome://extensions)
            // ============================================================
            console.log('='.repeat(70));
            console.log(`${colors.bright}CHROME NATIVE ERRORS${colors.reset} (from chrome://extensions/?errors=)`);
            console.log('='.repeat(70));
            console.log();

            const chromeErrors = await getChromeNativeErrors(extensionId);

            if (!chromeErrors.available) {
                console.log(`  ${colors.yellow}⚠ ${chromeErrors.reason}${colors.reset}`);
                console.log(`  ${colors.dim}Open: chrome://extensions/?errors=${extensionId}${colors.reset}\n`);
            } else {
                const manifestErrors = chromeErrors.manifestErrors || [];
                const runtimeErrors = chromeErrors.runtimeErrors || [];

                if (manifestErrors.length > 0) {
                    console.log(`${colors.yellow}Manifest Errors: ${manifestErrors.length}${colors.reset}\n`);
                    manifestErrors.forEach((err, idx) => {
                        console.log(formatChromeError(err, idx));
                        console.log();
                    });
                    totalErrors += manifestErrors.length;
                }

                if (runtimeErrors.length > 0) {
                    console.log(`${colors.yellow}Runtime Errors: ${runtimeErrors.length}${colors.reset}\n`);
                    runtimeErrors.forEach((err, idx) => {
                        console.log(formatChromeError(err, idx));
                        console.log();
                    });
                    totalErrors += runtimeErrors.length;
                }

                if (manifestErrors.length === 0 && runtimeErrors.length === 0) {
                    console.log(`  ${colors.green}✨ No Chrome native errors${colors.reset}\n`);
                }
            }

            // ============================================================
            // SECTION 2: Stored Errors (from chrome.storage.local)
            // ============================================================
            console.log('='.repeat(70));
            console.log(`${colors.bright}STORED ERRORS${colors.reset} (from chrome.storage.local)`);
            console.log('='.repeat(70));
            console.log();

            const storedErrors = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        chrome.storage.local.get(['${STORAGE_KEY}'], (result) => {
                            resolve(result['${STORAGE_KEY}'] || []);
                        });
                    });
                })()
            `);

            if (storedErrors.length > 0) {
                console.log(`  Found ${colors.bright}${storedErrors.length}${colors.reset} stored error(s)\n`);
                storedErrors.forEach((err, idx) => {
                    console.log(formatStoredError(err, idx));
                    console.log();
                });
                totalErrors += storedErrors.length;
            } else {
                console.log(`  ${colors.green}✨ No stored errors${colors.reset}\n`);
            }

            // ============================================================
            // SECTION 3: In-Memory Errors
            // ============================================================
            console.log('='.repeat(70));
            console.log(`${colors.bright}IN-MEMORY ERRORS${colors.reset}`);
            console.log('='.repeat(70));
            console.log();

            const memoryErrors = await evaluateCode(ws, `
                (function() {
                    if (typeof globalThis !== 'undefined' && globalThis._surfingkeysErrors) {
                        return globalThis._surfingkeysErrors;
                    }
                    return null;
                })()
            `);

            if (memoryErrors && memoryErrors.length > 0) {
                console.log(`  Found ${colors.bright}${memoryErrors.length}${colors.reset} error(s) in memory\n`);
                memoryErrors.forEach((err, idx) => {
                    console.log(formatStoredError(err, idx));
                    console.log();
                });
                totalErrors += memoryErrors.length;
            } else {
                console.log(`  ${colors.dim}No in-memory errors${colors.reset}\n`);
            }

            // ============================================================
            // SUMMARY
            // ============================================================
            console.log('='.repeat(70));
            console.log(`${colors.bright}SUMMARY${colors.reset}`);
            console.log('='.repeat(70));

            if (chromeErrors.available) {
                console.log(`  Chrome manifest errors: ${colors.bright}${chromeErrors.manifestErrors?.length || 0}${colors.reset}`);
                console.log(`  Chrome runtime errors: ${colors.bright}${chromeErrors.runtimeErrors?.length || 0}${colors.reset}`);
            }
            console.log(`  Stored errors: ${colors.bright}${storedErrors.length}${colors.reset}`);
            console.log(`  In-memory errors: ${colors.bright}${memoryErrors ? memoryErrors.length : 0}${colors.reset}`);
            console.log(`  ${colors.bright}Total: ${totalErrors}${colors.reset}`);
            console.log();

            if (totalErrors === 0) {
                console.log(`${colors.green}✅ No errors found${colors.reset}\n`);
            }

            console.log(`${colors.dim}To view in browser: chrome-extension://${extensionId}/pages/error-viewer.html${colors.reset}`);
            console.log(`${colors.dim}To clear errors: bin/dbg errors-clear${colors.reset}`);
            console.log();

            ws.close();
            process.exit(totalErrors > 0 ? 1 : 0);

        } catch (error) {
            console.error(`${colors.red}Error: ${error.message}${colors.reset}\n`);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (error) => {
        console.error(`${colors.red}WebSocket error: ${error.message}${colors.reset}\n`);
        process.exit(1);
    });
}

module.exports = { run };
