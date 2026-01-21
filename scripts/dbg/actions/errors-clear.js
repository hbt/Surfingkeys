/**
 * Errors Clear Action
 *
 * Clears all extension errors from:
 * 1. chrome.storage.local (Surfingkeys custom error collection)
 * 2. chrome://extensions/?errors=<id> page (clicks "Clear all" button)
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
    red: '\x1b[31m'
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
 * Click "Clear all" button on chrome://extensions page (searches Shadow DOM)
 */
async function clickClearAllButton(extensionId) {
    const tabWsUrl = await findExtensionsErrorTab(extensionId);

    if (!tabWsUrl) {
        return {
            success: false,
            reason: `chrome://extensions/?errors=${extensionId} tab not open`
        };
    }

    return new Promise((resolve) => {
        const ws = new WebSocket(tabWsUrl);
        const timeout = setTimeout(() => {
            ws.close();
            resolve({ success: false, reason: 'Timeout connecting to extensions page' });
        }, 5000);

        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                // Search Shadow DOM for "Clear all" button and click it
                const result = await evaluateCode(ws, `
                    (function() {
                        // Helper to search in shadow DOM recursively
                        function findInShadowDOM(root, test) {
                            const results = [];

                            function search(element) {
                                if (test(element)) {
                                    results.push(element);
                                }
                                if (element.shadowRoot) {
                                    Array.from(element.shadowRoot.querySelectorAll('*')).forEach(search);
                                }
                                Array.from(element.children).forEach(search);
                            }

                            search(root);
                            return results;
                        }

                        // Search for clear button
                        const clearButtons = findInShadowDOM(document.body, (el) => {
                            const tag = el.tagName?.toLowerCase();
                            const text = el.textContent?.toLowerCase() || '';
                            const id = el.id?.toLowerCase() || '';

                            return (
                                (tag === 'button' || tag === 'cr-button' || tag === 'paper-button') &&
                                (text.includes('clear') || id.includes('clear'))
                            );
                        });

                        if (clearButtons.length > 0) {
                            clearButtons[0].click();
                            return { clicked: true, buttonText: clearButtons[0].textContent.trim() };
                        }

                        return { clicked: false, error: 'Clear all button not found in Shadow DOM' };
                    })()
                `);

                clearTimeout(timeout);
                ws.close();

                if (result.clicked) {
                    resolve({ success: true, buttonText: result.buttonText });
                } else {
                    resolve({ success: false, reason: result.error });
                }
            } catch (error) {
                clearTimeout(timeout);
                ws.close();
                resolve({ success: false, reason: error.message });
            }
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            resolve({ success: false, reason: error.message });
        });
    });
}

/**
 * Main action runner
 */
async function run(args) {
    console.log(`${colors.bright}Clear Extension Errors${colors.reset}\n`);

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

            let clearedSomething = false;

            // ============================================================
            // SECTION 1: Clear Chrome Native Errors (click "Clear all")
            // ============================================================
            console.log(`${colors.cyan}Clearing Chrome native errors...${colors.reset}`);

            const chromeResult = await clickClearAllButton(extensionId);

            if (chromeResult.success) {
                console.log(`  ${colors.green}✓ Clicked "${chromeResult.buttonText}" button${colors.reset}\n`);
                clearedSomething = true;
            } else {
                console.log(`  ${colors.yellow}⚠ ${chromeResult.reason}${colors.reset}`);
                console.log(`  ${colors.dim}Open: chrome://extensions/?errors=${extensionId}${colors.reset}\n`);
            }

            // ============================================================
            // SECTION 2: Clear Stored Errors (chrome.storage.local)
            // ============================================================
            console.log(`${colors.cyan}Clearing stored errors...${colors.reset}`);

            const errorsBefore = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        chrome.storage.local.get(['${STORAGE_KEY}'], (result) => {
                            const errors = result['${STORAGE_KEY}'] || [];
                            resolve({ count: errors.length });
                        });
                    });
                })()
            `);

            console.log(`  Found ${colors.bright}${errorsBefore.count}${colors.reset} stored error(s)`);

            const clearResult = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        chrome.storage.local.set({ '${STORAGE_KEY}': [] }, () => {
                            resolve({ success: true });
                        });
                    });
                })()
            `);

            if (clearResult.success) {
                console.log(`  ${colors.green}✓ Cleared stored errors${colors.reset}\n`);
                if (errorsBefore.count > 0) clearedSomething = true;
            } else {
                console.log(`  ${colors.red}✗ Failed to clear stored errors${colors.reset}\n`);
            }

            // ============================================================
            // SECTION 3: Clear In-Memory Errors
            // ============================================================
            console.log(`${colors.cyan}Clearing in-memory errors...${colors.reset}`);

            const memoryResult = await evaluateCode(ws, `
                (function() {
                    if (typeof globalThis !== 'undefined' && globalThis._surfingkeysErrors) {
                        const count = globalThis._surfingkeysErrors.length;
                        globalThis._surfingkeysErrors = [];
                        return { cleared: true, count: count };
                    }
                    return { cleared: false, reason: 'Not available in memory' };
                })()
            `);

            if (memoryResult.cleared) {
                console.log(`  ${colors.green}✓ Cleared ${memoryResult.count} in-memory error(s)${colors.reset}\n`);
                if (memoryResult.count > 0) clearedSomething = true;
            } else {
                console.log(`  ${colors.dim}${memoryResult.reason}${colors.reset}\n`);
            }

            // ============================================================
            // SUMMARY
            // ============================================================
            if (clearedSomething) {
                console.log(`${colors.green}✅ Errors cleared successfully${colors.reset}\n`);
            } else {
                console.log(`${colors.yellow}⚠ No errors to clear${colors.reset}\n`);
            }

            ws.close();
            process.exit(0);

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
