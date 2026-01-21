/**
 * Reload Extension Action
 *
 * Reloads the Surfingkeys extension using CDP Message Bridge.
 * Falls back to keyboard shortcut if bridge method fails.
 *
 * Output: JSON only to stdout
 * Logs: Written to /tmp/dbg-reload-<timestamp>.log
 *
 * Independent implementation - does not depend on debug/ directory
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

let messageId = 1;
const CDP_PORT = process.env.CDP_PORT || 9222;
const CDP_ENDPOINT = `http://localhost:${CDP_PORT}`;

// Create log file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = `/tmp/dbg-reload-${timestamp}.log`;
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
 * Detect Surfingkeys extension ID
 */
async function detectExtensionId() {
    const targets = await fetchJson('/json');

    // Look for Surfingkeys service worker (background.js)
    const sw = targets.find(t =>
        t.type === 'service_worker' &&
        t.url?.includes('background.js')
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
 * Method 1: Reload using CDP Message Bridge
 */
async function reloadViaBridge(extensionId) {
    log('Method 1: CDP Message Bridge - __CDP_MESSAGE_BRIDGE__.dispatch()');

    const swWsUrl = await findServiceWorker();
    if (!swWsUrl) {
        log('✗ Service worker not found');
        return { success: false, error: 'Service worker not found' };
    }

    log(`Connecting to service worker: ${swWsUrl}`);
    const ws = new WebSocket(swWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');
                log('Connected to service worker');

                // Check if bridge is available
                const bridgeAvailable = await evaluateCode(ws, `
                    typeof globalThis.__CDP_MESSAGE_BRIDGE__ !== 'undefined'
                `);

                if (!bridgeAvailable) {
                    log('✗ CDP Message Bridge not available');
                    ws.close();
                    resolve({ success: false, error: 'CDP Message Bridge not available' });
                    return;
                }

                log('CDP Message Bridge found');

                // Dispatch reload command via bridge
                const result = await evaluateCode(ws, `
                    (function() {
                        return globalThis.__CDP_MESSAGE_BRIDGE__.dispatch(
                            'cdpReloadExtension',
                            {},
                            true
                        );
                    })()
                `);

                log(`Bridge response: ${JSON.stringify(result)}`);

                ws.close();

                if (result && result.status === 'reload_initiated') {
                    log('✓ Extension reload initiated successfully');
                    resolve({ success: true, method: 'cdp_bridge', response: result });
                } else {
                    log(`✗ Unexpected response: ${JSON.stringify(result)}`);
                    resolve({ success: false, error: 'Unexpected response from bridge', response: result });
                }
            } catch (error) {
                log(`✗ Error: ${error.message}`);
                ws.close();
                resolve({ success: false, error: error.message });
            }
        });

        ws.on('error', (error) => {
            log(`✗ WebSocket error: ${error.message}`);
            resolve({ success: false, error: error.message });
        });
    });
}

/**
 * Method 2: Reload using keyboard shortcut (Alt+Shift+R)
 */
async function reloadViaKeyboard() {
    log('Method 2: Keyboard shortcut (Alt+Shift+R)');

    return new Promise((resolve) => {
        const proc = spawn('xdotool', ['key', 'alt+shift+r']);

        proc.on('close', (code) => {
            if (code === 0) {
                log('✓ Keyboard shortcut triggered');
                resolve({ success: true, method: 'keyboard' });
            } else {
                log(`✗ xdotool failed (exit code: ${code})`);
                resolve({ success: false, error: `xdotool exit code: ${code}` });
            }
        });

        proc.on('error', (error) => {
            log(`✗ xdotool not available: ${error.message}`);
            resolve({ success: false, error: 'xdotool not available' });
        });
    });
}

/**
 * Main action runner
 */
async function run(args) {
    log('=== Reload Extension Action ===');
    log(`CDP Port: ${CDP_PORT}`);

    try {
        // Detect extension ID
        log('Detecting extension...');
        const extensionId = await detectExtensionId();

        if (!extensionId) {
            log('ERROR: Could not detect Surfingkeys extension ID');
            logStream.end();

            console.log(JSON.stringify({
                success: false,
                error: 'Extension not detected',
                details: `Browser must be running with CDP on port ${CDP_PORT}`,
                log: LOG_FILE
            }));
            process.exit(1);
        }

        log(`Extension ID: ${extensionId}`);

        // Try CDP Message Bridge method
        let result = await reloadViaBridge(extensionId);

        // Fallback to keyboard if bridge failed
        if (!result.success) {
            log('Bridge method failed, trying keyboard fallback...');
            result = await reloadViaKeyboard();
        }

        logStream.end();

        // Output JSON result
        console.log(JSON.stringify({
            success: result.success,
            method: result.method,
            extensionId: extensionId,
            response: result.response,
            error: result.error,
            log: LOG_FILE
        }));

        process.exit(result.success ? 0 : 1);

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
