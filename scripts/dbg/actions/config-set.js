/**
 * Preflight Checks for Config Set
 *
 * Collects runtime checks before setting config file:
 * - advancedMode: Current advanced mode setting from chrome.storage.local
 * - userScriptsAvailable: Whether chrome.userScripts API is available (MV3 requirement)
 * - snippets: Information about stored user scripts
 *   - stored: Whether snippets key exists (0 or 1)
 *   - length: Size of snippets string
 *   - hash: SHA256 hash of snippets content (if stored)
 *
 * Usage: bin/dbg config-set
 *
 * Output: JSON only to stdout
 * Logs: Written to /tmp/dbg-config-set-<timestamp>.log
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

let messageId = 1;
const CDP_PORT = process.env.CDP_PORT || 9222;
const CDP_ENDPOINT = `http://localhost:${CDP_PORT}`;

// Create log file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = `/tmp/dbg-config-set-${timestamp}.log`;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Log to file only
 */
function log(message) {
    logStream.write(`${new Date().toISOString()} ${message}\n`);
}

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
 * Find Surfingkeys service worker
 */
async function findServiceWorker() {
    const targets = await fetchJson('/json');

    const sw = targets.find(t =>
        t.type === 'service_worker' &&
        t.url?.includes('background.js')
    );

    return sw ? sw.webSocketDebuggerUrl : null;
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
 * Evaluate code in service worker context
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
 * Collect preflight checks: advancedMode, userScripts availability, and snippets info
 */
async function getPreflightChecks(ws) {
    log(`Collecting preflight checks...`);

    const code = `
        new Promise(async (resolve) => {
            chrome.storage.local.get(['showAdvanced', 'snippets'], async (data) => {
                const snippets = data.snippets;
                const snippetsInfo = {
                    stored: snippets ? 1 : 0,
                    length: snippets ? snippets.length : 0,
                    hash: null
                };

                // Calculate SHA256 hash if snippets exist
                if (snippets && snippets.length > 0) {
                    try {
                        const encoder = new TextEncoder();
                        const buffer = encoder.encode(snippets);
                        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                        const hashArray = Array.from(new Uint8Array(hashBuffer));
                        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                        snippetsInfo.hash = hashHex;
                    } catch (e) {
                        snippetsInfo.hash = 'error: ' + e.message;
                    }
                }

                resolve({
                    advancedMode: data.showAdvanced,
                    userScriptsAvailable: !!chrome.userScripts,
                    snippets: snippetsInfo
                });
            });
        })
    `;

    const result = await evaluateCode(ws, code);
    return result;
}

/**
 * Main action
 */
async function run(args) {
    log(`Preflight Checks Started`);

    try {
        // Find service worker
        log('Finding Surfingkeys service worker...');
        const swWsUrl = await findServiceWorker();

        if (!swWsUrl) {
            log('✗ Service worker not found');
            throw new Error('Surfingkeys extension not found. Is it loaded? Try: npm run esbuild:dev && ./bin/dbg reload');
        }

        log(`✓ Service worker found`);

        // Connect to service worker
        log('Connecting to service worker via CDP...');
        const ws = new WebSocket(swWsUrl);

        const response = await new Promise(async (resolve) => {
            ws.on('open', async () => {
                try {
                    log('✓ Connected to service worker');

                    // Enable Runtime domain
                    await sendCommand(ws, 'Runtime.enable');
                    log('✓ Runtime domain enabled');

                    // Collect preflight checks
                    const preflightChecks = await getPreflightChecks(ws);
                    log(`✓ Preflight checks collected: ${JSON.stringify(preflightChecks)}`);

                    ws.close();

                    resolve({
                        success: true,
                        preflight: preflightChecks,
                        log: LOG_FILE
                    });

                } catch (error) {
                    log(`✗ Error: ${error.message}`);
                    ws.close();
                    resolve({
                        success: false,
                        error: error.message,
                        log: LOG_FILE
                    });
                }
            });

            ws.on('error', (error) => {
                log(`✗ WebSocket error: ${error.message}`);
                resolve({
                    success: false,
                    error: `WebSocket error: ${error.message}`,
                    log: LOG_FILE
                });
            });
        });

        logStream.end();
        console.log(JSON.stringify(response));
        process.exit(response.success ? 0 : 1);

    } catch (error) {
        log(`FATAL ERROR: ${error.message}`);
        log(error.stack);
        logStream.end();

        console.log(JSON.stringify({
            success: false,
            error: error.message,
            log: LOG_FILE
        }));
        process.exit(1);
    }
}

module.exports = { run };
