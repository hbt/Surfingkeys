/**
 * Reload Extension Action
 *
 * Reloads the Surfingkeys extension using multiple fallback methods:
 * 1. chrome.developerPrivate.reload() via CDP (requires chrome://extensions tab)
 * 2. chrome.management.setEnabled() toggle via CDP
 * 3. Keyboard shortcut simulation (last resort)
 *
 * Independent implementation - does not depend on debug/ directory
 */

const WebSocket = require('ws');
const http = require('http');
const { spawn } = require('child_process');

// Color utilities
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

let messageId = 1;
const CDP_PORT = process.env.CDP_PORT || 9222;
const CDP_ENDPOINT = `http://localhost:${CDP_PORT}`;

/**
 * Fetch JSON from CDP endpoint
 */
async function fetchJson(path) {
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
 * Detect Surfingkeys extension ID
 */
async function detectExtensionId() {
    const targets = await fetchJson('/json');

    // Look for Surfingkeys service worker
    const sw = targets.find(t =>
        t.type === 'service_worker' &&
        (t.title === 'Surfingkeys' || t.url?.includes('surfingkeys'))
    );

    if (sw && sw.url) {
        const match = sw.url.match(/chrome-extension:\/\/([a-z]+)/);
        if (match) {
            return match[1];
        }
    }

    return null;
}

/**
 * Find chrome://extensions tab
 */
async function findExtensionsTab(extensionId) {
    const targets = await fetchJson('/json');

    // Try exact match first
    let tab = targets.find(t =>
        t.type === 'page' && t.url?.includes(`chrome://extensions/?errors=${extensionId}`)
    );

    // Fall back to any chrome://extensions page
    if (!tab) {
        tab = targets.find(t =>
            t.type === 'page' && t.url?.startsWith('chrome://extensions')
        );
    }

    return tab ? tab.webSocketDebuggerUrl : null;
}

/**
 * Send CDP command via WebSocket
 */
function sendCommand(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

        const handler = (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result);
                }
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

/**
 * Evaluate code in chrome://extensions context
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
 * Method 1: Reload using chrome.developerPrivate.reload()
 */
async function reloadViaDeveloperPrivate(extensionId) {
    console.log(`${colors.yellow}Method 1: chrome.developerPrivate.reload()${colors.reset}`);

    const tabWsUrl = await findExtensionsTab(extensionId);
    if (!tabWsUrl) {
        console.log(`  ${colors.red}✗ chrome://extensions tab not found${colors.reset}`);
        return false;
    }

    const ws = new WebSocket(tabWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                const result = await evaluateCode(ws, `
                    (async function() {
                        const extensionId = '${extensionId}';

                        return new Promise((resolve) => {
                            if (!chrome.developerPrivate || !chrome.developerPrivate.reload) {
                                resolve({
                                    success: false,
                                    error: 'chrome.developerPrivate.reload not available'
                                });
                                return;
                            }

                            chrome.developerPrivate.reload(extensionId, {}, () => {
                                const err = chrome.runtime.lastError;
                                if (err) {
                                    resolve({ success: false, error: err.message });
                                } else {
                                    resolve({ success: true });
                                }
                            });
                        });
                    })()
                `);

                ws.close();

                if (result.success) {
                    console.log(`  ${colors.green}✓ Extension reloaded successfully${colors.reset}`);
                    resolve(true);
                } else {
                    console.log(`  ${colors.red}✗ Failed: ${result.error}${colors.reset}`);
                    resolve(false);
                }
            } catch (error) {
                console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
                ws.close();
                resolve(false);
            }
        });

        ws.on('error', () => {
            resolve(false);
        });
    });
}

/**
 * Method 2: Reload using keyboard shortcut (Alt+Shift+R)
 */
async function reloadViaKeyboard() {
    console.log(`${colors.yellow}Method 2: Keyboard shortcut (Alt+Shift+R)${colors.reset}`);

    return new Promise((resolve) => {
        const proc = spawn('xdotool', ['key', 'alt+shift+r']);

        proc.on('close', (code) => {
            if (code === 0) {
                console.log(`  ${colors.green}✓ Keyboard shortcut triggered${colors.reset}`);
                resolve(true);
            } else {
                console.log(`  ${colors.red}✗ xdotool failed (exit code: ${code})${colors.reset}`);
                resolve(false);
            }
        });

        proc.on('error', () => {
            console.log(`  ${colors.red}✗ xdotool not available${colors.reset}`);
            resolve(false);
        });
    });
}

/**
 * Main action runner
 */
async function run(args) {
    console.log(`${colors.bright}Reload Extension${colors.reset}\n`);

    // Detect extension ID
    console.log(`${colors.cyan}Detecting extension...${colors.reset}`);
    const extensionId = await detectExtensionId();

    if (!extensionId) {
        console.error(`${colors.red}Error: Could not detect Surfingkeys extension ID${colors.reset}`);
        console.error(`Make sure the extension is installed and the browser is running with CDP on port ${CDP_PORT}\n`);
        process.exit(1);
    }

    console.log(`  Extension ID: ${colors.bright}${extensionId}${colors.reset}\n`);

    // Try methods in order
    let success = await reloadViaDeveloperPrivate(extensionId);

    if (!success) {
        console.log();
        success = await reloadViaKeyboard();
    }

    console.log();

    if (success) {
        console.log(`${colors.green}✅ Extension reload completed${colors.reset}\n`);
        process.exit(0);
    } else {
        console.log(`${colors.red}❌ All reload methods failed${colors.reset}\n`);
        process.exit(1);
    }
}

module.exports = { run };
