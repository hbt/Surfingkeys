/**
 * Open Background DevTools Action
 *
 * Opens the background service worker DevTools console
 * using chrome.developerPrivate.openDevTools() via CDP
 *
 * Independent implementation - does not depend on debug/ directory
 */

const WebSocket = require('ws');
const http = require('http');

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
 * Main action runner
 */
async function run(args) {
    console.log(`${colors.bright}Open Background DevTools Console${colors.reset}\n`);

    // Detect extension
    console.log(`${colors.cyan}Detecting extension...${colors.reset}`);
    const extensionId = await detectExtensionId();

    if (!extensionId) {
        console.error(`${colors.red}Error: Could not detect Surfingkeys extension ID${colors.reset}`);
        console.error(`Make sure the extension is installed and the browser is running with CDP on port ${CDP_PORT}\n`);
        process.exit(1);
    }

    console.log(`  Extension ID: ${colors.bright}${extensionId}${colors.reset}\n`);

    // Find chrome://extensions tab
    console.log(`${colors.cyan}Finding chrome://extensions tab...${colors.reset}`);
    const tabWsUrl = await findExtensionsTab(extensionId);

    if (!tabWsUrl) {
        console.error(`${colors.red}Error: chrome://extensions tab not found${colors.reset}`);
        console.error(`Please open: ${colors.cyan}chrome://extensions/?errors=${extensionId}${colors.reset}`);
        console.error(`Or: ${colors.cyan}chrome://extensions${colors.reset}\n`);
        process.exit(1);
    }

    console.log(`  ${colors.green}✓ Found${colors.reset}\n`);

    // Connect and open DevTools
    const ws = new WebSocket(tabWsUrl);

    ws.on('open', async () => {
        try {
            await sendCommand(ws, 'Runtime.enable');
            console.log(`${colors.cyan}Opening background DevTools...${colors.reset}\n`);

            const result = await evaluateCode(ws, `
                (async function() {
                    const extensionId = '${extensionId}';

                    return new Promise((resolve) => {
                        if (!chrome.developerPrivate || !chrome.developerPrivate.openDevTools) {
                            resolve({
                                success: false,
                                error: 'chrome.developerPrivate.openDevTools not available',
                                hint: 'Must run from chrome://extensions page context'
                            });
                            return;
                        }

                        chrome.developerPrivate.openDevTools({
                            extensionId: extensionId,
                            renderProcessId: -1,
                            renderViewId: -1,
                            isServiceWorker: true,
                            incognito: false
                        }, () => {
                            const err = chrome.runtime.lastError;
                            if (err) {
                                resolve({
                                    success: false,
                                    error: err.message
                                });
                            } else {
                                resolve({
                                    success: true,
                                    message: 'DevTools opened successfully'
                                });
                            }
                        });
                    });
                })()
            `);

            ws.close();

            if (result.success) {
                console.log(`${colors.green}✅ Background DevTools console opened!${colors.reset}\n`);
                console.log(`${colors.cyan}Look for the new DevTools window that appeared.${colors.reset}`);
                console.log(`${colors.cyan}It should show the service worker console.${colors.reset}\n`);
                process.exit(0);
            } else {
                console.error(`${colors.red}❌ Failed to open DevTools${colors.reset}\n`);
                console.error(`Error: ${result.error}`);
                if (result.hint) {
                    console.error(`Hint: ${result.hint}`);
                }
                console.log();
                process.exit(1);
            }

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
