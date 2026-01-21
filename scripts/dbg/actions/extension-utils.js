/**
 * Shared Extension Detection Utilities
 *
 * Provides extension detection with auto-wake for dormant service workers.
 * Used by: reload.js, errors-list.js, errors-clear.js, etc.
 */

const WebSocket = require('ws');
const http = require('http');

const CDP_PORT = process.env.CDP_PORT || 9222;
const CDP_ENDPOINT = `http://localhost:${CDP_PORT}`;

let messageId = 1;

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
 * Detect extension ID from service worker (only works when SW is awake)
 */
async function detectFromServiceWorker() {
    const targets = await fetchJson('/json');

    const sw = targets.find(t =>
        t.type === 'service_worker' &&
        t.url?.includes('background.js')
    );

    if (sw && sw.url) {
        const match = sw.url.match(/chrome-extension:\/\/([a-z]+)/);
        if (match) {
            return { id: match[1], wsUrl: sw.webSocketDebuggerUrl };
        }
    }

    return null;
}

/**
 * Detect extension ID from iframe (works even when SW is dormant)
 */
async function detectFromIframe() {
    const targets = await fetchJson('/json');

    const iframe = targets.find(t =>
        t.type === 'iframe' &&
        t.url?.includes('chrome-extension://') &&
        t.url?.includes('frontend.html')
    );

    if (iframe && iframe.url) {
        const match = iframe.url.match(/chrome-extension:\/\/([a-z]+)/);
        if (match) {
            return { id: match[1], wsUrl: iframe.webSocketDebuggerUrl };
        }
    }

    return null;
}

/**
 * Wake dormant service worker via browser CDP Target.createTarget
 */
async function wakeServiceWorker(extensionId, log = () => {}) {
    log('Service worker is dormant - waking up via browser CDP...');

    const versionInfo = await fetchJson('/json/version');
    const browserWsUrl = versionInfo.webSocketDebuggerUrl;

    if (!browserWsUrl) {
        log('Could not get browser WebSocket URL');
        return { success: false, error: 'no_browser_ws' };
    }

    const ws = new WebSocket(browserWsUrl);

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            ws.close();
            resolve({ success: false, error: 'timeout' });
        }, 5000);

        ws.on('open', async () => {
            try {
                const optionsUrl = `chrome-extension://${extensionId}/pages/options.html`;
                log(`Creating target: ${optionsUrl}`);

                const result = await sendCommand(ws, 'Target.createTarget', {
                    url: optionsUrl
                });

                clearTimeout(timeout);
                ws.close();

                if (result.targetId) {
                    log(`Created target ${result.targetId} to wake service worker`);
                    resolve({ success: true, targetId: result.targetId });
                } else {
                    resolve({ success: false });
                }
            } catch (error) {
                clearTimeout(timeout);
                log(`Error waking service worker: ${error.message}`);
                ws.close();
                resolve({ success: false, error: error.message });
            }
        });

        ws.on('error', (error) => {
            clearTimeout(timeout);
            log(`WebSocket error: ${error.message}`);
            resolve({ success: false, error: error.message });
        });
    });
}

/**
 * Detect extension ID, waking service worker if needed
 * Returns { id, wsUrl } or null
 *
 * @param {Function} log - Optional logging function
 */
async function detectExtension(log = () => {}) {
    // First try: service worker (ideal case - SW is awake)
    let result = await detectFromServiceWorker();
    if (result) {
        log(`Extension detected from service worker: ${result.id}`);
        return result;
    }

    // Second try: iframe (SW may be dormant)
    log('Service worker not found, checking for extension iframe...');
    const iframeInfo = await detectFromIframe();

    if (!iframeInfo) {
        log('No extension iframe found either');
        return null;
    }

    log(`Extension detected from iframe: ${iframeInfo.id}`);

    // Wake the service worker
    const wakeResult = await wakeServiceWorker(iframeInfo.id, log);

    if (!wakeResult.success) {
        log('Failed to wake service worker');
        return null;
    }

    // Wait for service worker to appear (max 3s)
    log('Waiting for service worker to become available...');
    for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const swResult = await detectFromServiceWorker();
        if (swResult) {
            log('Service worker is now awake');
            return swResult;
        }
    }

    log('Service worker did not appear after wake');
    return null;
}

/**
 * Find service worker WebSocket URL (with auto-wake)
 */
async function findServiceWorker(log = () => {}) {
    const result = await detectExtension(log);
    return result ? result.wsUrl : null;
}

module.exports = {
    fetchJson,
    sendCommand,
    detectExtension,
    findServiceWorker,
    wakeServiceWorker,
    CDP_PORT,
    CDP_ENDPOINT
};
