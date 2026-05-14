/**
 * Reload Extension Action
 *
 * Builds and reloads the Surfingkeys extension.
 * 1. Runs npm run build:dev
 * 2. Reloads extension via CDP
 *
 * Output: JSON only to stdout
 * Logs: Written to /tmp/dbg-reload-<timestamp>.log
 *
 * Independent implementation - does not depend on debug/ directory
 */

export {};

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

let messageId = 1;
const CDP_PORT = process.env.CDP_PORT || 9222;
const CDP_ENDPOINT = `http://localhost:${CDP_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'dist/development/chrome/manifest.json');
const FIXTURES_PORT = 9873;
const FIXTURES_SERVER_PATH = path.join(PROJECT_ROOT, 'tests/fixtures-server.js');
let fixturesServerProcess = null;

// Create log file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = `/tmp/dbg-reload-${timestamp}.log`;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Log to file only
 */
function log(message: string) {
    logStream.write(`${new Date().toISOString()} ${message}\n`);
}

const CONFIG_SERVER_PORT = 9600;
const CONFIG_SERVER_URL = `http://localhost:${CONFIG_SERVER_PORT}`;

/**
 * Check if the local config server is running on port 9600
 * Returns { running: true, file: '...' } or { running: false }
 */
function checkConfigServer() {
    return new Promise((resolve) => {
        const req = http.get(`${CONFIG_SERVER_URL}/health`, (res: unknown) => {
            const r = res as { statusCode: number; on: (event: string, cb: (...args: unknown[]) => void) => void };
            let body = '';
            r.on('data', (chunk: unknown) => body += String(chunk));
            r.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve({ running: r.statusCode === 200 && data.status === 'ok', file: data.file || null });
                } catch (_) {
                    resolve({ running: false });
                }
            });
        });
        req.on('error', () => resolve({ running: false }));
        req.setTimeout(1000, () => { req.abort(); resolve({ running: false }); });
    });
}

/**
 * Check if fixtures server is running on port 9873
 */
function isFixturesServerRunning() {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${FIXTURES_PORT}/hackernews.html`, (_res: unknown) => {
            req.abort();
            resolve(true);
        });

        req.on('error', () => {
            resolve(false);
        });

        req.setTimeout(1000);
    });
}

/**
 * Start fixtures server if it's not already running
 */
async function ensureFixturesServer() {
    log('Checking if fixtures server is running on port 9873...');

    const isRunning = await isFixturesServerRunning();

    if (isRunning) {
        log('✓ Fixtures server is already running');
        return { success: true, started: false };
    }

    log('Fixtures server not running - starting it...');

    if (!fs.existsSync(FIXTURES_SERVER_PATH)) {
        log(`✗ Fixtures server not found at ${FIXTURES_SERVER_PATH}`);
        return { success: false, error: 'Fixtures server script not found' };
    }

    return new Promise((resolve) => {
        fixturesServerProcess = spawn('node', [FIXTURES_SERVER_PATH], {
            cwd: PROJECT_ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false
        });

        let isReady = false;
        const timeout = setTimeout(() => {
            if (!isReady) {
                log('⚠ Fixtures server startup timeout - assuming it started');
                resolve({ success: true, started: true, warning: 'startup_timeout' });
            }
        }, 3000);

        fixturesServerProcess.stdout.on('data', (data: unknown) => {
            const message = String(data);
            log(`[Fixtures Server] ${message.trim()}`);

            if (message.includes('running at http://127.0.0.1:9873')) {
                isReady = true;
                clearTimeout(timeout);
                log('✓ Fixtures server started successfully');
                resolve({ success: true, started: true });
            }
        });

        fixturesServerProcess.stderr.on('data', (data: unknown) => {
            const message = String(data);
            log(`[Fixtures Server Error] ${message.trim()}`);

            if (message.includes('EADDRINUSE')) {
                isReady = true;
                clearTimeout(timeout);
                log('✗ Port 9873 is already in use');
                resolve({ success: false, error: 'Port 9873 already in use' });
            }
        });

        fixturesServerProcess.on('error', (error: Error) => {
            clearTimeout(timeout);
            log(`✗ Failed to start fixtures server: ${error.message}`);
            resolve({ success: false, error: error.message });
        });
    });
}

/**
 * Run npm run build:dev and capture output
 * Returns { success, output, error, duration }
 */
function runBuild() {
    log('Running npm run build:dev...');
    const startTime = Date.now();

    return new Promise((resolve) => {
        const proc = spawn('npm', ['run', 'build:dev'], {
            cwd: PROJECT_ROOT,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data: unknown) => {
            stdout += String(data);
        });

        proc.stderr.on('data', (data: unknown) => {
            stderr += String(data);
        });

        proc.on('close', (code: number | null) => {
            const duration = Date.now() - startTime;
            const output = stdout + stderr;

            if (code === 0) {
                log(`✓ Build completed in ${duration}ms`);
                resolve({
                    success: true,
                    output: output.trim(),
                    duration
                });
            } else {
                log(`✗ Build failed (exit code ${code})`);
                log(`Build output:\n${output}`);
                resolve({
                    success: false,
                    exitCode: code,
                    output: output.trim(),
                    error: `Build failed with exit code ${code}`,
                    duration
                });
            }
        });

        proc.on('error', (error: Error) => {
            const duration = Date.now() - startTime;
            log(`✗ Build error: ${error.message}`);
            resolve({
                success: false,
                error: error.message,
                duration
            });
        });
    });
}

/**
 * Read build timestamp from manifest.json
 * Returns timestamp string or null if not found
 */
function readBuildTimestamp() {
    try {
        if (!fs.existsSync(MANIFEST_PATH)) {
            log(`Manifest not found at ${MANIFEST_PATH}`);
            return null;
        }

        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        const description = manifest.description || '';

        // Extract timestamp from "[Built: 2026-01-21T12:49:04.114Z]"
        const match = description.match(/\[Built: ([^\]]+)\]/);
        if (match) {
            return match[1];
        }

        log('Build timestamp not found in manifest description');
        return null;
    } catch (error) {
        log(`Error reading manifest: ${(error as Error).message}`);
        return null;
    }
}

/**
 * Fetch JSON from CDP endpoint
 */
async function fetchJson(path: string) {
    return new Promise((resolve, reject) => {
        http.get(`${CDP_ENDPOINT}${path}`, (res: unknown) => {
            const r = res as { on: (event: string, cb: (...args: unknown[]) => void) => void };
            let body = '';
            r.on('data', (chunk: unknown) => body += String(chunk));
            r.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${(error as Error).message}`));
                }
            });
        }).on('error', reject);
    });
}

/**
 * Detect Surfingkeys extension ID from service worker
 */
async function detectExtensionIdFromServiceWorker() {
    const targets = await fetchJson('/json') as Array<{ type: string; url?: string; webSocketDebuggerUrl?: string }>;

    // Look for Surfingkeys service worker (background.js)
    const sw = targets.find((t: { type: string; url?: string }) =>
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
 * Detect Surfingkeys extension ID from iframe (works even when service worker is dormant)
 */
async function detectExtensionIdFromIframe() {
    const targets = await fetchJson('/json') as Array<{ type: string; url?: string; webSocketDebuggerUrl?: string }>;

    // Look for Surfingkeys iframe (frontend.html)
    const iframe = targets.find((t: { type: string; url?: string }) =>
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
 * Wake dormant service worker by opening extension page via browser CDP
 * Uses Target.createTarget to open extension page directly (bypasses stale iframe contexts)
 */
async function wakeServiceWorker(iframeWsUrl: string | undefined, extensionId: string) {
    log('Service worker is dormant - waking up via browser CDP...');

    // Get browser WebSocket URL
    const versionInfo = await fetchJson('/json/version') as Record<string, unknown>;
    const browserWsUrl = versionInfo.webSocketDebuggerUrl as string | undefined;

    if (!browserWsUrl) {
        log('✗ Could not get browser WebSocket URL');
        return { success: false, error: 'no_browser_ws' };
    }

    const ws = new WebSocket(browserWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                // Create a new target with the extension options page
                const optionsUrl = `chrome-extension://${extensionId}/pages/options.html`;
                log(`Creating target: ${optionsUrl}`);

                const result = await sendCommand(ws, 'Target.createTarget', {
                    url: optionsUrl
                });

                ws.close();

                const res = result as Record<string, unknown>;
                if (res.targetId) {
                    log(`✓ Created target ${res.targetId} to wake service worker`);
                    resolve({ success: true, targetId: res.targetId });
                } else {
                    log('✗ Failed to create target');
                    resolve({ success: false });
                }
            } catch (error) {
                log(`✗ Error waking service worker: ${(error as Error).message}`);
                ws.close();
                resolve({ success: false, error: (error as Error).message });
            }
        });

        ws.on('error', (error: Error) => {
            log(`✗ WebSocket error: ${error.message}`);
            resolve({ success: false, error: error.message });
        });

        // Timeout after 5 seconds
        setTimeout(() => {
            ws.close();
            resolve({ success: false, error: 'timeout' });
        }, 5000);
    });
}

/**
 * Detect extension ID, waking service worker if needed
 */
async function detectExtensionId() {
    // First try: service worker (ideal case)
    let extensionId = await detectExtensionIdFromServiceWorker();
    if (extensionId) {
        log(`Extension detected from service worker: ${extensionId}`);
        return extensionId;
    }

    // Second try: iframe (service worker may be dormant)
    log('Service worker not found, checking for extension iframe...');
    const iframeInfo = await detectExtensionIdFromIframe();

    if (!iframeInfo) {
        log('No extension iframe found either');
        return null;
    }

    log(`Extension detected from iframe: ${iframeInfo.id}`);

    // Wake the service worker
    const wakeResult = await wakeServiceWorker(iframeInfo.wsUrl, iframeInfo.id) as Record<string, unknown>;

    if (!wakeResult.success) {
        log('Failed to wake service worker, but proceeding with extension ID');
        return iframeInfo.id;
    }

    // Wait for service worker to appear
    log('Waiting for service worker to become available...');
    for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const swId = await detectExtensionIdFromServiceWorker();
        if (swId) {
            log(`✓ Service worker is now awake`);
            return swId;
        }
    }

    log('Service worker did not appear after wake, proceeding with iframe-detected ID');
    return iframeInfo.id;
}

/**
 * Find Surfingkeys service worker
 */
async function findServiceWorker() {
    const targets = await fetchJson('/json') as Array<{ type: string; url?: string; webSocketDebuggerUrl?: string }>;

    const sw = targets.find((t: { type: string; url?: string }) =>
        t.type === 'service_worker' &&
        t.url?.includes('background.js')
    );

    return sw ? sw.webSocketDebuggerUrl : null;
}

/**
 * Send CDP command via WebSocket
 */
function sendCommand(ws: unknown, method: string, params: unknown = {}) {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
        const wsTyped = ws as { on: (event: string, cb: unknown) => void; removeListener: (event: string, cb: unknown) => void; send: (data: string) => void; close: () => void };

        const handler = (data: unknown) => {
            const msg = JSON.parse((data as Buffer).toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                wsTyped.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result);
                }
            }
        };

        wsTyped.on('message', handler);
        wsTyped.send(JSON.stringify({ id, method, params }));
    });
}

/**
 * Evaluate code in service worker context
 */
async function evaluateCode(ws: unknown, expression: string) {
    const result = await sendCommand(ws, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
    }) as Record<string, unknown>;

    if (result.exceptionDetails) {
        throw new Error((result.exceptionDetails as Record<string, unknown>).text as string || 'Evaluation failed');
    }

    return (result.result as Record<string, unknown> | undefined)?.value;
}

/**
 * Get extension start timestamp (to verify reload)
 */
async function getExtensionStartTime() {
    const swWsUrl = await findServiceWorker();
    if (!swWsUrl) {
        return null;
    }

    const ws = new WebSocket(swWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                // Get timestamp when extension started (or a unique identifier)
                const startTime = await evaluateCode(ws, `
                    (function() {
                        // Use a global timestamp or create one
                        if (!globalThis.__EXTENSION_START_TIME__) {
                            globalThis.__EXTENSION_START_TIME__ = Date.now();
                        }
                        return globalThis.__EXTENSION_START_TIME__;
                    })()
                `);

                ws.close();
                resolve(startTime);
            } catch (error) {
                ws.close();
                resolve(null);
            }
        });

        ws.on('error', () => {
            resolve(null);
        });
    });
}

/**
 * Wait for service worker to become available after reload
 */
async function waitForServiceWorker(maxWaitMs = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const swWsUrl = await findServiceWorker();
        if (swWsUrl) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
}

/**
 * Check CDP Message Bridge connectivity (NOT for reload, just connectivity test)
 */
async function checkCDPBridgeConnectivity() {
    log('CDP Bridge Connectivity Check...');

    const swWsUrl = await findServiceWorker();
    if (!swWsUrl) {
        log('✗ Service worker not found');
        return { available: false, reason: 'service_worker_not_found' };
    }

    const ws = new WebSocket(swWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                const bridgeAvailable = await evaluateCode(ws, `
                    typeof globalThis.__CDP_MESSAGE_BRIDGE__ !== 'undefined'
                `);

                ws.close();

                if (bridgeAvailable) {
                    log('✓ CDP Message Bridge available - extension is healthy');
                    resolve({ available: true });
                } else {
                    log('✗ CDP Message Bridge not available - extension may be broken/dormant');
                    resolve({ available: false, reason: 'bridge_not_initialized' });
                }
            } catch (error) {
                log(`✗ Error checking bridge: ${(error as Error).message}`);
                ws.close();
                resolve({ available: false, reason: (error as Error).message });
            }
        });

        ws.on('error', (error: Error) => {
            log(`✗ WebSocket error: ${error.message}`);
            resolve({ available: false, reason: error.message });
        });
    });
}

/**
 * Get build timestamp from manifest (for verification)
 */
async function getBuildTimestamp(extensionId: string) {
    const tabWsUrl = await findErrorsTab(extensionId);

    if (!tabWsUrl) {
        return null;
    }

    const ws = new WebSocket(tabWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                const extensionInfo = await evaluateCode(ws, `
                    (function() {
                        return new Promise((resolve) => {
                            if (!chrome.developerPrivate) {
                                resolve({ error: 'API not available' });
                                return;
                            }

                            chrome.developerPrivate.getExtensionInfo('${extensionId}', (details) => {
                                const err = chrome.runtime.lastError;
                                if (err) {
                                    resolve({ error: err.message });
                                } else {
                                    const match = details.description?.match(/\\[Built: ([^\\]]+)\\]/);
                                    resolve({
                                        description: details.description,
                                        buildTimestamp: match ? match[1] : null
                                    });
                                }
                            });
                        });
                    })()
                `) as Record<string, unknown>;

                ws.close();

                if (extensionInfo.error) {
                    resolve(null);
                } else {
                    resolve(extensionInfo.buildTimestamp);
                }
            } catch (error) {
                ws.close();
                resolve(null);
            }
        });

        ws.on('error', () => {
            resolve(null);
        });
    });
}

/**
 * PRIMARY METHOD: Reload via button click on chrome://extensions
 * Works even with broken extensions
 */
async function reloadViaButton(extensionId: string) {
    log('PRIMARY METHOD: Click reload button on chrome://extensions');

    // Get timestamp BEFORE reload
    log('Getting build timestamp before reload...');
    const timestampBefore = await getBuildTimestamp(extensionId);

    if (timestampBefore) {
        log(`Build timestamp before: ${timestampBefore}`);
    } else {
        log('Could not get build timestamp before reload (will skip verification)');
    }

    // Find and click reload button
    const tabWsUrl = await findExtensionsTab();

    if (!tabWsUrl) {
        log('✗ chrome://extensions tab not found');
        return { success: false, error: 'chrome://extensions tab not found' };
    }

    const ws = new WebSocket(tabWsUrl);

    const clickResult = await new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');
                await sendCommand(ws, 'DOM.enable');

                log('Searching for reload button (#dev-reload-button)...');

                // Find and click reload button
                const result = await evaluateCode(ws, `
                    (function() {
                        function findInShadowDOM(root, test) {
                            const results = [];
                            function search(element) {
                                if (test(element)) results.push(element);
                                if (element.shadowRoot) {
                                    Array.from(element.shadowRoot.querySelectorAll('*')).forEach(search);
                                }
                                Array.from(element.children).forEach(search);
                            }
                            search(root);
                            return results;
                        }

                        const reloadButtons = findInShadowDOM(document.body, (el) => {
                            const tag = el.tagName?.toLowerCase();
                            const id = el.id?.toLowerCase() || '';
                            const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
                            return (
                                (tag === 'button' || tag === 'cr-button' || tag === 'cr-icon-button') &&
                                (id.includes('reload') || ariaLabel.includes('reload'))
                            );
                        });

                        if (reloadButtons.length > 0) {
                            reloadButtons[0].click();
                            return { clicked: true, buttonId: reloadButtons[0].id };
                        }

                        return { clicked: false, error: 'Reload button not found' };
                    })()
                `);

                ws.close();

                resolve(result);
            } catch (error) {
                log(`✗ Error: ${(error as Error).message}`);
                ws.close();
                resolve({ clicked: false, error: (error as Error).message });
            }
        });

        ws.on('error', (error: Error) => {
            resolve({ clicked: false, error: error.message });
        });
    });

    const cr = clickResult as Record<string, unknown>;
    if (!cr.clicked) {
        log(`✗ Failed to click reload button: ${cr.error}`);
        return { success: false, error: cr.error };
    }

    log(`✓ Reload button clicked (${cr.buttonId})`);

    // Wait for reload to execute
    log('Waiting for extension to reload...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get timestamp AFTER reload for verification
    log('Getting build timestamp after reload...');
    const timestampAfter = await getBuildTimestamp(extensionId);

    if (timestampAfter) {
        log(`Build timestamp after: ${timestampAfter}`);

        if (timestampBefore && timestampAfter !== timestampBefore) {
            log(`✓ Reload verified! Build timestamp changed`);
            return {
                success: true,
                method: 'reload_button',
                verified: true,
                timestampBefore,
                timestampAfter
            };
        } else if (!timestampBefore) {
            log('Reload completed (verification skipped - no timestamp before)');
            return {
                success: true,
                method: 'reload_button',
                verified: false,
                timestampAfter
            };
        } else {
            log('⚠ Timestamps match - reload may not have taken effect');
            return {
                success: true,
                method: 'reload_button',
                verified: false,
                warning: 'Timestamps unchanged',
                timestampBefore,
                timestampAfter
            };
        }
    } else {
        log('Could not get timestamp after reload');
        return {
            success: true,
            method: 'reload_button',
            verified: false,
            warning: 'Could not verify reload'
        };
    }
}

/**
 * Ensure required tabs exist (create if missing)
 * Since CDP can create chrome://extensions tabs without policy restrictions,
 * we simply ensure they exist rather than complex checking/self-healing
 */
async function ensureRequiredTabs(extensionId: string) {
    log('Ensuring required tabs exist...');

    const swWsUrl = await findServiceWorker();
    if (!swWsUrl) {
        log('✗ Service worker not found');
        return { success: false, reason: 'service_worker_not_found' };
    }

    const ws = new WebSocket(swWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                // Ensure tabs exist via CDP evaluation
                const result = await evaluateCode(ws, `
                    (async function() {
                        const extensionsPageUrl = 'chrome://extensions/';
                        const errorsPageUrl = 'chrome://extensions/?errors=${extensionId}';

                        async function findTab(targetUrl) {
                            return new Promise((resolve) => {
                                chrome.tabs.query({}, (tabs) => {
                                    const tab = tabs.find(t =>
                                        t.url === targetUrl ||
                                        t.pendingUrl === targetUrl ||
                                        (t.url && t.url.startsWith(targetUrl))
                                    );
                                    resolve(tab || null);
                                });
                            });
                        }

                        async function createTab(url) {
                            return new Promise((resolve, reject) => {
                                chrome.tabs.create({ url, active: false }, (tab) => {
                                    if (chrome.runtime.lastError) {
                                        reject(new Error(chrome.runtime.lastError.message));
                                    } else {
                                        resolve(tab);
                                    }
                                });
                            });
                        }

                        const created = [];

                        // Ensure main extensions page exists
                        const extTab = await findTab(extensionsPageUrl);
                        if (!extTab) {
                            await createTab(extensionsPageUrl);
                            created.push('extensions');
                        }

                        // Ensure errors page exists
                        const errTab = await findTab(errorsPageUrl);
                        if (!errTab) {
                            await createTab(errorsPageUrl);
                            created.push('errors');
                        }

                        return { created };
                    })()
                `);

                ws.close();

                const res = result as Record<string, unknown>;
                if ((res.created as unknown[]).length > 0) {
                    log(`✓ Created missing tabs: ${(res.created as string[]).join(', ')}`);
                } else {
                    log('✓ All required tabs already exist');
                }

                resolve({ success: true, created: res.created });
            } catch (error) {
                log(`✗ Error ensuring tabs: ${(error as Error).message}`);
                ws.close();
                resolve({ success: false, reason: (error as Error).message });
            }
        });

        ws.on('error', (error: Error) => {
            log(`✗ WebSocket error: ${error.message}`);
            resolve({ success: false, reason: error.message });
        });
    });
}

/**
 * Find chrome://extensions tab (generic)
 */
async function findExtensionsTab() {
    const targets = await fetchJson('/json') as Array<{ type: string; url?: string; webSocketDebuggerUrl?: string }>;

    const tab = targets.find((t: { type: string; url?: string }) =>
        t.type === 'page' && t.url?.startsWith('chrome://extensions')
    );

    return tab ? tab.webSocketDebuggerUrl : null;
}

/**
 * Find chrome://extensions/?errors=<id> tab (specific)
 */
async function findErrorsTab(extensionId: string) {
    const targets = await fetchJson('/json') as Array<{ type: string; url?: string; webSocketDebuggerUrl?: string }>;

    const tab = targets.find((t: { type: string; url?: string }) =>
        t.type === 'page' && t.url?.includes(`chrome://extensions/?errors=${extensionId}`)
    );

    return tab ? tab.webSocketDebuggerUrl : null;
}

/**
 * Clear previous errors from chrome://extensions page
 * This ensures any errors we extract later are fresh from THIS reload
 */
async function clearPreviousErrors(extensionId: string) {
    log('Clearing previous errors from chrome://extensions...');

    const tabWsUrl = await findErrorsTab(extensionId);

    if (!tabWsUrl) {
        log('chrome://extensions tab not found - cannot clear errors');
        return { success: false, reason: 'tab_not_found' };
    }

    const ws = new WebSocket(tabWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');
                await sendCommand(ws, 'DOM.enable');

                // Find and click "Clear all" button in Shadow DOM
                const clearResult = await evaluateCode(ws, `
                    (function() {
                        // Search in Shadow DOM recursively
                        function findInShadowDOM(root, test) {
                            const results = [];
                            function search(element) {
                                if (test(element)) results.push(element);
                                if (element.shadowRoot) {
                                    Array.from(element.shadowRoot.querySelectorAll('*')).forEach(search);
                                }
                                Array.from(element.children).forEach(search);
                            }
                            search(root);
                            return results;
                        }

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
                            return { cleared: true };
                        }

                        return { cleared: false, reason: 'button_not_found' };
                    })()
                `);

                ws.close();

                const cr2 = clearResult as Record<string, unknown>;
                if (cr2.cleared) {
                    log('✓ Previous errors cleared');
                    resolve({ success: true });
                } else {
                    log('Clear button not found - may be no errors to clear');
                    resolve({ success: false, reason: cr2.reason });
                }

            } catch (error) {
                log(`Error during clear: ${(error as Error).message}`);
                ws.close();
                resolve({ success: false, reason: (error as Error).message });
            }
        });

        ws.on('error', () => {
            resolve({ success: false, reason: 'websocket_error' });
        });
    });
}

/**
 * Extract extension errors from chrome://extensions page
 */
async function extractExtensionErrors(extensionId: string) {
    log('Extracting extension errors from chrome://extensions...');

    const tabWsUrl = await findErrorsTab(extensionId);

    if (!tabWsUrl) {
        log('chrome://extensions tab not found - cannot extract errors');
        return null;
    }

    const ws = new WebSocket(tabWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                const extensionInfo = await evaluateCode(ws, `
                    (function() {
                        return new Promise((resolve) => {
                            if (!chrome.developerPrivate || !chrome.developerPrivate.getExtensionInfo) {
                                resolve({
                                    error: 'chrome.developerPrivate.getExtensionInfo not available'
                                });
                                return;
                            }

                            chrome.developerPrivate.getExtensionInfo('${extensionId}', (details) => {
                                const err = chrome.runtime.lastError;
                                if (err) {
                                    resolve({ error: err.message });
                                } else {
                                    resolve({
                                        id: details.id,
                                        name: details.name,
                                        version: details.version,
                                        enabled: details.enabled,
                                        manifestErrors: details.manifestErrors || [],
                                        runtimeErrors: details.runtimeErrors || []
                                    });
                                }
                            });
                        });
                    })()
                `);

                ws.close();

                const ei = extensionInfo as Record<string, unknown>;
                if (ei.error) {
                    log(`Error extracting extension info: ${ei.error}`);
                    resolve(null);
                    return;
                }

                const manifestErrors = (ei.manifestErrors as unknown[]) || [];
                const runtimeErrors = (ei.runtimeErrors as unknown[]) || [];

                log(`Extracted ${manifestErrors.length} manifest error(s), ${runtimeErrors.length} runtime error(s)`);

                resolve({
                    manifestErrors,
                    runtimeErrors,
                    hasErrors: manifestErrors.length > 0 || runtimeErrors.length > 0
                });

            } catch (error) {
                log(`Error during extraction: ${(error as Error).message}`);
                ws.close();
                resolve(null);
            }
        });

        ws.on('error', () => {
            resolve(null);
        });
    });
}

/**
 * Calculate SHA256 hash of file content (Node.js side)
 */
function calculateFileHash(fileContent: string) {
    try {
        const buffer = Buffer.from(fileContent, 'utf-8');
        const hashBuffer = crypto.createHash('sha256').update(buffer).digest();
        const hashHex = hashBuffer.toString('hex');
        return hashHex;
    } catch (err) {
        throw new Error(`Failed to calculate hash: ${(err as Error).message}`);
    }
}

/**
 * Check extension health after reload (non-blocking post-validation)
 */
async function checkExtensionHealth() {
    log('Checking extension health...');

    const swWsUrl = await findServiceWorker();
    if (!swWsUrl) {
        log('✗ Service worker not found for health check');
        return null;
    }

    const ws = new WebSocket(swWsUrl);

    // Check config server before opening WebSocket
    const configServer = await checkConfigServer() as Record<string, unknown>;
    log(`Config server running: ${configServer.running}`);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                const storageData = await evaluateCode(ws, `
                    new Promise(async (resolve) => {
                        chrome.storage.local.get(['showAdvanced', 'snippets', 'localPath'], async (data) => {
                            const snippets = data.snippets || '';
                            const localPath = data.localPath || '';
                            const showAdvanced = data.showAdvanced || false;

                            // Calculate hash of stored snippets
                            let storedSnippetsHash = null;
                            try {
                                const encoder = new TextEncoder();
                                const buffer = encoder.encode(snippets);
                                const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                                const hashArray = Array.from(new Uint8Array(hashBuffer));
                                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                                storedSnippetsHash = hashHex;
                            } catch (e) {
                                storedSnippetsHash = 'error';
                            }

                            resolve({
                                showAdvanced: showAdvanced,
                                snippetsLength: snippets.length,
                                storedSnippetsHash: storedSnippetsHash,
                                localPathValue: localPath
                            });
                        });
                    })
                `) as Record<string, unknown>;

                ws.close();

                // Build health object conditionally based on config server status
                let fileHashCheck;
                let configServerCheck;

                if (configServer.running) {
                    // Server is active — fetch config bytes and compare to disk
                    let serverBytes = null;
                    let diskBytes = null;
                    let sizeMatch = false;

                    try {
                        const configContent = await new Promise((res, rej) => {
                            const req = http.get(`${CONFIG_SERVER_URL}/config`, (r: unknown) => {
                                const rr = r as { on: (event: string, cb: (...args: unknown[]) => void) => void };
                                let body = '';
                                rr.on('data', (c: unknown) => body += String(c));
                                rr.on('end', () => res(body));
                            });
                            req.on('error', rej);
                            req.setTimeout(2000, () => { req.abort(); rej(new Error('timeout')); });
                        }) as string;
                        serverBytes = configContent.length;

                        const diskContent = fs.readFileSync(configServer.file as string, 'utf-8');
                        diskBytes = diskContent.length;
                        sizeMatch = serverBytes === diskBytes;

                        log(`Config server bytes: ${serverBytes}, disk bytes: ${diskBytes}, match: ${sizeMatch}`);
                    } catch (err) {
                        log(`✗ Error comparing server vs disk: ${(err as Error).message}`);
                    }

                    configServerCheck = {
                        running: true,
                        file: configServer.file,
                        server_bytes: serverBytes,
                        disk_bytes: diskBytes,
                        match: sizeMatch
                    };

                    fileHashCheck = { skipped: true, reason: 'config_server_active' };
                } else {
                    // Server not running — use existing file-vs-storage hash check
                    configServerCheck = { running: false };

                    let fileHash = null;
                    let fileExists = false;
                    let hashMatch = false;
                    let fileSize = null;

                    const sd = storageData as Record<string, unknown>;
                    if (sd.localPathValue) {
                        try {
                            let filePath = String(sd.localPathValue);
                            if (filePath.startsWith('file://')) {
                                filePath = decodeURIComponent(new URL(filePath).pathname);
                            }

                            log(`Comparing file at: ${filePath}`);
                            log(`Stored snippets hash: ${sd.storedSnippetsHash}`);
                            log(`Stored snippets size: ${sd.snippetsLength} bytes`);

                            if (fs.existsSync(filePath)) {
                                fileExists = true;
                                try {
                                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                                    fileHash = calculateFileHash(fileContent);
                                    fileSize = fileContent.length;
                                    hashMatch = fileHash === sd.storedSnippetsHash;

                                    log(`File hash:           ${fileHash}`);
                                    log(`File size:           ${fileSize} bytes`);
                                    log(`Stored hash:         ${sd.storedSnippetsHash}`);
                                    log(`Hash match:          ${hashMatch}`);

                                    if (!hashMatch) {
                                        log(`⚠ Hash mismatch! File and storage differ.`);
                                        log(`  First 100 chars of file: ${fileContent.substring(0, 100)}`);
                                    }
                                } catch (err) {
                                    log(`✗ Error reading/hashing file: ${(err as Error).message}`);
                                    log(`Stack: ${(err as Error).stack ?? ''}`);
                                    fileHash = 'error';
                                }
                            } else {
                                log(`✗ Config file not found: ${filePath}`);
                            }
                        } catch (err) {
                            log(`✗ Error during file comparison: ${(err as Error).message}`);
                            log(`Stack: ${(err as Error).stack ?? ''}`);
                            fileHash = 'error';
                        }
                    } else {
                        log(`No localPath stored - skipping file comparison`);
                    }

                    fileHashCheck = {
                        file_exists: fileExists,
                        file_size: fileSize,
                        stored_size: sd.snippetsLength,
                        file_hash: fileHash,
                        stored_snippets_hash: sd.storedSnippetsHash,
                        match: hashMatch
                    };
                }

                const sd2 = storageData as Record<string, unknown>;
                const source = configServer.running ? 'config_server'
                    : sd2.localPathValue ? 'local_path'
                    : 'none';

                const health = {
                    advanced_mode_enabled: {
                        value: sd2.showAdvanced
                    },
                    config_server: configServerCheck,
                    snippets_present: {
                        stored: (sd2.snippetsLength as number) > 0,
                        length: sd2.snippetsLength,
                        hash: sd2.storedSnippetsHash
                    },
                    localPath_present: {
                        stored: !!sd2.localPathValue,
                        value: sd2.localPathValue,
                        source
                    },
                    file_hash_match: fileHashCheck
                };

                logStream.write(`${new Date().toISOString()} ✓ Extension health checked\n`);
                resolve(health);
            } catch (error) {
                log(`✗ Error checking health: ${(error as Error).message}`);
                ws.close();
                resolve(null);
            }
        });

        ws.on('error', (error: Error) => {
            log(`✗ WebSocket error: ${error.message}`);
            resolve(null);
        });
    });
}

/**
 * Reload all tabs in all windows via Chrome tabs API
 * Uses CDP to evaluate chrome.tabs.query/reload in service worker
 */
async function reloadAllTabs() {
    log('Reloading all tabs via chrome.tabs API...');

    const swWsUrl = await findServiceWorker();
    if (!swWsUrl) {
        log('✗ Service worker not found - cannot reload tabs');
        return { success: false, error: 'service_worker_not_found', count: 0 };
    }

    const ws = new WebSocket(swWsUrl);

    return new Promise((resolve) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                const result = await evaluateCode(ws, `
                    (function() {
                        return new Promise((resolve) => {
                            chrome.tabs.query({}, (tabs) => {
                                const err = chrome.runtime.lastError;
                                if (err) {
                                    resolve({ error: err.message, count: 0 });
                                    return;
                                }

                                // Filter out chrome:// and extension pages
                                const reloadableTabs = tabs.filter(t =>
                                    t.url &&
                                    !t.url.startsWith('chrome://') &&
                                    !t.url.startsWith('chrome-extension://') &&
                                    !t.url.startsWith('about:')
                                );

                                // Wait for all reload callbacks to complete
                                const reloadPromises = reloadableTabs.map(tab =>
                                    new Promise((resolveTab) => {
                                        chrome.tabs.reload(tab.id, { bypassCache: false }, () => {
                                            resolveTab();
                                        });
                                    })
                                );

                                Promise.all(reloadPromises).then(() => {
                                    resolve({
                                        count: reloadableTabs.length,
                                        total: tabs.length
                                    });
                                });
                            });
                        });
                    })()
                `);

                ws.close();

                const r = result as Record<string, unknown>;
                if (r.error) {
                    log(`✗ Error reloading tabs: ${r.error}`);
                    resolve({ success: false, error: r.error, count: 0 });
                } else {
                    log(`✓ Reloaded ${r.count} tabs (${r.total} total, skipped chrome:// pages)`);
                    resolve({ success: true, count: r.count, total: r.total });
                }
            } catch (error) {
                log(`✗ Error: ${(error as Error).message}`);
                ws.close();
                resolve({ success: false, error: (error as Error).message, count: 0 });
            }
        });

        ws.on('error', (error: Error) => {
            log(`✗ WebSocket error: ${error.message}`);
            resolve({ success: false, error: error.message, count: 0 });
        });

        // Timeout after 10 seconds
        setTimeout(() => {
            ws.close();
            resolve({ success: false, error: 'timeout', count: 0 });
        }, 10000);
    });
}

/**
 * LAST RESORT: Reload using keyboard shortcut (Alt+Shift+R)
 * WARNING: UNRELIABLE - This is a shot in the dark
 * - Does not work when extension is broken
 * - Cannot verify reload occurred
 * - No error feedback
 * Keep for reference only
 */
async function reloadViaKeyboard() {
    log('LAST RESORT: Keyboard shortcut (Alt+Shift+R) - UNRELIABLE');
    log('WARNING: This method is unreliable and cannot verify reload');

    return new Promise((resolve) => {
        const proc = spawn('xdotool', ['key', 'alt+shift+r']);

        proc.on('close', (code: number | null) => {
            if (code === 0) {
                log('⚠ Keyboard shortcut triggered (but cannot verify if reload worked)');
                resolve({
                    success: true,
                    method: 'keyboard',
                    unreliable: true,
                    warnings: [
                        'Keyboard method is UNRELIABLE - shot in the dark',
                        'Cannot verify if reload actually occurred',
                        'Does not work with broken extensions',
                        'No error feedback available'
                    ]
                });
            } else {
                log(`✗ xdotool failed (exit code: ${code})`);
                resolve({ success: false, error: `xdotool exit code: ${code}` });
            }
        });

        proc.on('error', (error: Error) => {
            log(`✗ xdotool not available: ${error.message}`);
            resolve({ success: false, error: 'xdotool not available' });
        });
    });
}

/**
 * Main action runner - FINALIZED FLOW
 */
async function run(args: unknown[]) {
    log('=== Reload Extension Action (Finalized) ===');
    log(`CDP Port: ${CDP_PORT}`);

    const attempts = [];
    const warnings = [];
    let buildInfo = null;

    try {
        // STEP 0: Ensure fixtures server is running
        log('STEP 0: Ensure fixtures server is running');
        const fixturesResult = await ensureFixturesServer() as Record<string, unknown>;

        if (!fixturesResult.success) {
            log('⚠ Warning: Could not start fixtures server - continuing anyway');
            warnings.push(`Fixtures server: ${fixturesResult.error}`);
        } else {
            if (fixturesResult.started) {
                log('✓ Fixtures server is ready for CDP tests');
            }
        }

        // STEP 1: Run build:dev
        log('STEP 1: Running build:dev');
        const buildResult = await runBuild() as Record<string, unknown>;

        if (!buildResult.success) {
            log('ERROR: Build failed');
            logStream.end();

            console.log(JSON.stringify({
                success: false,
                error: 'Build failed',
                build: {
                    success: false,
                    error: buildResult.error,
                    exitCode: buildResult.exitCode,
                    duration: buildResult.duration,
                    output: buildResult.output
                },
                log: LOG_FILE
            }));
            process.exit(1);
        }

        // Get build timestamp from manifest
        const buildTimestamp = readBuildTimestamp();
        buildInfo = {
            success: true,
            duration: buildResult.duration,
            timestamp: buildTimestamp
        };
        log(`Build timestamp: ${buildTimestamp}`);

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

        // STEP 2: Ensure required tabs exist
        log('STEP 2: Ensure required tabs exist');
        const tabsResult = await ensureRequiredTabs(extensionId as string) as Record<string, unknown>;

        if (!tabsResult.success) {
            log('ERROR: Failed to ensure required tabs');
            logStream.end();

            console.log(JSON.stringify({
                success: false,
                error: 'Failed to ensure required tabs',
                details: `Could not create tabs: ${tabsResult.reason}`,
                log: LOG_FILE
            }));
            process.exit(1);
        }

        if ((tabsResult.created as unknown[]).length > 0) {
            log(`✓ Created missing tabs: ${(tabsResult.created as string[]).join(', ')}`);
        } else {
            log('✓ All required tabs already exist');
        }

        // STEP 3: Clear previous errors
        log('STEP 3: Clear previous errors');
        const clearResult = await clearPreviousErrors(extensionId as string) as Record<string, unknown>;

        if (clearResult.success) {
            log('✓ Previous errors cleared');
        } else {
            log(`ERROR: Could not clear errors: ${clearResult.reason}`);
            if (clearResult.reason === 'button_not_found') {
                log('FATAL: Clear button not found on chrome://extensions/?errors= page');
                log('This indicates the extension may have corruption or UI issues');
                log('Unable to proceed with reload without clearing existing errors');
                throw new Error(`Cannot clear extension errors: ${clearResult.reason}`);
            } else {
                log(`Warning: Proceeding despite error clearing: ${clearResult.reason}`);
            }
        }

        // STEP 4: CDP Bridge connectivity check
        log('STEP 4: CDP Bridge connectivity check');
        const bridgeCheck = await checkCDPBridgeConnectivity() as Record<string, unknown>;
        attempts.push({
            method: 'cdp_bridge_check',
            available: bridgeCheck.available,
            reason: bridgeCheck.reason
        });

        if (!bridgeCheck.available) {
            warnings.push('CDP Message Bridge not available - extension may be broken or dormant');
        }

        // STEP 5: Reload via button click (PRIMARY METHOD)
        log('STEP 5: Reload via button click (PRIMARY METHOD)');
        const buttonResult = await reloadViaButton(extensionId as string) as Record<string, unknown>;
        attempts.push({
            method: 'reload_button',
            ...buttonResult
        });

        let finalResult: Record<string, unknown> = buttonResult;
        let errors: Record<string, unknown> | null = null;

        // If button reload failed, extract errors and try keyboard as last resort
        if (!buttonResult.success) {
            log('Button reload failed, extracting fresh errors...');

            // Wait for Chrome to populate errors
            log('Waiting 1s for Chrome to populate errors...');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // STEP 6: Extract fresh errors
            log('STEP 6: Extract fresh errors from chrome://extensions');
            errors = await extractExtensionErrors(extensionId as string) as Record<string, unknown> | null;

            if (errors && errors.hasErrors) {
                log(`Found ${(errors.manifestErrors as unknown[]).length + (errors.runtimeErrors as unknown[]).length} fresh error(s)`);
                warnings.push('Extension has errors from THIS reload');
            }

            // STEP 7: Last resort - keyboard (UNRELIABLE)
            log('STEP 7: Last resort - keyboard shortcut (UNRELIABLE)');
            const keyboardResult = await reloadViaKeyboard() as Record<string, unknown>;
            attempts.push({
                method: 'keyboard',
                ...keyboardResult
            });

            if (keyboardResult.success && keyboardResult.warnings) {
                warnings.push(...(keyboardResult.warnings as string[]));
            }

            finalResult = keyboardResult;
        }

        // STEP 8: Reload all tabs (after extension reload completes)
        let tabsReloaded = null;
        if (finalResult.success) {
            log('STEP 8: Reload all tabs');
            tabsReloaded = await reloadAllTabs();
        }

        // STEP 9: Check extension health (non-blocking)
        let healthCheck = null;
        if (finalResult.success) {
            log('STEP 9: Check extension health');
            healthCheck = await checkExtensionHealth();
        }

        logStream.end();

        // Build comprehensive JSON response
        const response: Record<string, unknown> = {
            success: finalResult.success,
            method: finalResult.method,
            extensionId: extensionId,
            build: buildInfo,
            attempts: attempts,
            log: LOG_FILE
        };

        // Add verification info if available
        if (finalResult.verified !== undefined) {
            response.verified = finalResult.verified;
        }

        if (finalResult.timestampBefore) {
            response.timestampBefore = finalResult.timestampBefore;
        }

        if (finalResult.timestampAfter) {
            response.timestampAfter = finalResult.timestampAfter;
        }

        // Add warnings if any
        if (warnings.length > 0) {
            response.warnings = warnings;
        }

        // Add errors if extracted
        if (errors) {
            response.errors = {
                manifestErrors: errors.manifestErrors,
                runtimeErrors: errors.runtimeErrors,
                hasErrors: errors.hasErrors
            };
        }

        // Add tabs reload info
        if (tabsReloaded) {
            const tr = tabsReloaded as Record<string, unknown>;
            const trObj: Record<string, unknown> = {
                success: tr.success,
                count: tr.count,
                total: tr.total
            };
            if (tr.error) {
                trObj.error = tr.error;
            }
            response.tabsReloaded = trObj;
        }

        // Add health check info (non-blocking, doesn't affect success)
        if (healthCheck) {
            response.health = healthCheck;
        }

        // Add error field if present
        if (finalResult.error) {
            response.error = finalResult.error;
        }

        // Add warning field if present
        if (finalResult.warning) {
            if (!response.warnings) response.warnings = [];
            (response.warnings as unknown[]).push(finalResult.warning);
        }

        console.log(JSON.stringify(response));

        process.exit(finalResult.success ? 0 : 1);

    } catch (error) {
        log(`FATAL ERROR: ${(error as Error).message}`);
        log((error as Error).stack ?? '');
        logStream.end();

        console.log(JSON.stringify({
            success: false,
            error: (error as Error).message,
            log: LOG_FILE
        }));
        process.exit(1);
    }
}

module.exports = { run };
