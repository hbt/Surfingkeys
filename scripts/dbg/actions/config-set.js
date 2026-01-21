/**
 * Config Set Action
 *
 * Sets the external config file path in chrome.storage.local
 * Uses CDP Message Bridge to communicate with the extension.
 *
 * Usage: bin/dbg config-set <filepath>
 * Example: bin/dbg config-set file:///home/hassen/surfingkeys-2026.js
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
 * Set config path in chrome.storage.local
 */
async function setConfigPath(ws, filepath) {
    log(`Setting config path: ${filepath}`);

    const code = `
        new Promise((resolve, reject) => {
            chrome.storage.local.set({
                localPath: '${filepath.replace(/'/g, "\\'")}'
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve({ success: true, path: '${filepath}' });
                }
            });
        })
    `;

    const result = await evaluateCode(ws, code);
    return result;
}

/**
 * Verify config path was set
 */
async function verifyConfigPath(ws, expectedPath) {
    log(`Verifying config path...`);

    const code = `
        new Promise((resolve) => {
            chrome.storage.local.get('localPath', (data) => {
                resolve({
                    stored: data.localPath,
                    matches: data.localPath === '${expectedPath.replace(/'/g, "\\'")}'
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
    const filepath = args[0];

    if (!filepath) {
        console.log(JSON.stringify({
            success: false,
            error: 'Missing argument: filepath required',
            usage: 'bin/dbg config-set <filepath>',
            example: 'bin/dbg config-set file:///home/hassen/surfingkeys-2026.js',
            log: LOG_FILE
        }));
        logStream.end();
        process.exit(1);
    }

    log(`Config Set Action Started`);
    log(`Filepath: ${filepath}`);

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

                    // Set the config path
                    const setResult = await setConfigPath(ws, filepath);
                    log(`✓ Config path set: ${JSON.stringify(setResult)}`);

                    // Wait a moment for storage
                    await new Promise(r => setTimeout(r, 200));

                    // Verify it was set
                    const verifyResult = await verifyConfigPath(ws, filepath);
                    log(`✓ Verification result: ${JSON.stringify(verifyResult)}`);

                    ws.close();

                    resolve({
                        success: true,
                        filepath: filepath,
                        set: setResult,
                        verified: verifyResult,
                        log: LOG_FILE
                    });

                } catch (error) {
                    log(`✗ Error: ${error.message}`);
                    ws.close();
                    resolve({
                        success: false,
                        error: error.message,
                        filepath: filepath,
                        log: LOG_FILE
                    });
                }
            });

            ws.on('error', (error) => {
                log(`✗ WebSocket error: ${error.message}`);
                resolve({
                    success: false,
                    error: `WebSocket error: ${error.message}`,
                    filepath: filepath,
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
            filepath: filepath,
            log: LOG_FILE
        }));
        process.exit(1);
    }
}

module.exports = { run };
