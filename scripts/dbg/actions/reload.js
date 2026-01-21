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
 * Detect Surfingkeys extension ID from service worker
 */
async function detectExtensionIdFromServiceWorker() {
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
 * Detect Surfingkeys extension ID from iframe (works even when service worker is dormant)
 */
async function detectExtensionIdFromIframe() {
    const targets = await fetchJson('/json');

    // Look for Surfingkeys iframe (frontend.html)
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
 * Wake dormant service worker by opening extension page via browser CDP
 * Uses Target.createTarget to open extension page directly (bypasses stale iframe contexts)
 */
async function wakeServiceWorker(iframeWsUrl, extensionId) {
    log('Service worker is dormant - waking up via browser CDP...');

    // Get browser WebSocket URL
    const versionInfo = await fetchJson('/json/version');
    const browserWsUrl = versionInfo.webSocketDebuggerUrl;

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

                if (result.targetId) {
                    log(`✓ Created target ${result.targetId} to wake service worker`);
                    resolve({ success: true, targetId: result.targetId });
                } else {
                    log('✗ Failed to create target');
                    resolve({ success: false });
                }
            } catch (error) {
                log(`✗ Error waking service worker: ${error.message}`);
                ws.close();
                resolve({ success: false, error: error.message });
            }
        });

        ws.on('error', (error) => {
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
    const wakeResult = await wakeServiceWorker(iframeInfo.wsUrl, iframeInfo.id);

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
                log(`✗ Error checking bridge: ${error.message}`);
                ws.close();
                resolve({ available: false, reason: error.message });
            }
        });

        ws.on('error', (error) => {
            log(`✗ WebSocket error: ${error.message}`);
            resolve({ available: false, reason: error.message });
        });
    });
}

/**
 * Get build timestamp from manifest (for verification)
 */
async function getBuildTimestamp(extensionId) {
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
                `);

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
async function reloadViaButton(extensionId) {
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
                log(`✗ Error: ${error.message}`);
                ws.close();
                resolve({ clicked: false, error: error.message });
            }
        });

        ws.on('error', (error) => {
            resolve({ clicked: false, error: error.message });
        });
    });

    if (!clickResult.clicked) {
        log(`✗ Failed to click reload button: ${clickResult.error}`);
        return { success: false, error: clickResult.error };
    }

    log(`✓ Reload button clicked (${clickResult.buttonId})`);

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
async function ensureRequiredTabs(extensionId) {
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

                if (result.created.length > 0) {
                    log(`✓ Created missing tabs: ${result.created.join(', ')}`);
                } else {
                    log('✓ All required tabs already exist');
                }

                resolve({ success: true, created: result.created });
            } catch (error) {
                log(`✗ Error ensuring tabs: ${error.message}`);
                ws.close();
                resolve({ success: false, reason: error.message });
            }
        });

        ws.on('error', (error) => {
            log(`✗ WebSocket error: ${error.message}`);
            resolve({ success: false, reason: error.message });
        });
    });
}

/**
 * Find chrome://extensions tab (generic)
 */
async function findExtensionsTab() {
    const targets = await fetchJson('/json');

    const tab = targets.find(t =>
        t.type === 'page' && t.url?.startsWith('chrome://extensions')
    );

    return tab ? tab.webSocketDebuggerUrl : null;
}

/**
 * Find chrome://extensions/?errors=<id> tab (specific)
 */
async function findErrorsTab(extensionId) {
    const targets = await fetchJson('/json');

    const tab = targets.find(t =>
        t.type === 'page' && t.url?.includes(`chrome://extensions/?errors=${extensionId}`)
    );

    return tab ? tab.webSocketDebuggerUrl : null;
}

/**
 * Clear previous errors from chrome://extensions page
 * This ensures any errors we extract later are fresh from THIS reload
 */
async function clearPreviousErrors(extensionId) {
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

                if (clearResult.cleared) {
                    log('✓ Previous errors cleared');
                    resolve({ success: true });
                } else {
                    log('Clear button not found - may be no errors to clear');
                    resolve({ success: false, reason: clearResult.reason });
                }

            } catch (error) {
                log(`Error during clear: ${error.message}`);
                ws.close();
                resolve({ success: false, reason: error.message });
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
async function extractExtensionErrors(extensionId) {
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

                if (extensionInfo.error) {
                    log(`Error extracting extension info: ${extensionInfo.error}`);
                    resolve(null);
                    return;
                }

                const manifestErrors = extensionInfo.manifestErrors || [];
                const runtimeErrors = extensionInfo.runtimeErrors || [];

                log(`Extracted ${manifestErrors.length} manifest error(s), ${runtimeErrors.length} runtime error(s)`);

                resolve({
                    manifestErrors,
                    runtimeErrors,
                    hasErrors: manifestErrors.length > 0 || runtimeErrors.length > 0
                });

            } catch (error) {
                log(`Error during extraction: ${error.message}`);
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

        proc.on('close', (code) => {
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

        proc.on('error', (error) => {
            log(`✗ xdotool not available: ${error.message}`);
            resolve({ success: false, error: 'xdotool not available' });
        });
    });
}

/**
 * Main action runner - FINALIZED FLOW
 */
async function run(args) {
    log('=== Reload Extension Action (Finalized) ===');
    log(`CDP Port: ${CDP_PORT}`);

    const attempts = [];
    const warnings = [];

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

        // STEP 0: Ensure required tabs exist
        log('STEP 0: Ensure required tabs exist');
        const tabsResult = await ensureRequiredTabs(extensionId);

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

        if (tabsResult.created.length > 0) {
            log(`✓ Created missing tabs: ${tabsResult.created.join(', ')}`);
        } else {
            log('✓ All required tabs already exist');
        }

        // STEP 1: Clear previous errors
        log('STEP 1: Clear previous errors');
        const clearResult = await clearPreviousErrors(extensionId);

        if (clearResult.success) {
            log('✓ Previous errors cleared');
        } else {
            log(`Could not clear errors: ${clearResult.reason} - proceeding anyway`);
        }

        // STEP 2: CDP Bridge connectivity check
        log('STEP 2: CDP Bridge connectivity check');
        const bridgeCheck = await checkCDPBridgeConnectivity();
        attempts.push({
            method: 'cdp_bridge_check',
            available: bridgeCheck.available,
            reason: bridgeCheck.reason
        });

        if (!bridgeCheck.available) {
            warnings.push('CDP Message Bridge not available - extension may be broken or dormant');
        }

        // STEP 3: Reload via button click (PRIMARY METHOD)
        log('STEP 3: Reload via button click (PRIMARY METHOD)');
        const buttonResult = await reloadViaButton(extensionId);
        attempts.push({
            method: 'reload_button',
            success: buttonResult.success,
            ...buttonResult
        });

        let finalResult = buttonResult;
        let errors = null;

        // If button reload failed, extract errors and try keyboard as last resort
        if (!buttonResult.success) {
            log('Button reload failed, extracting fresh errors...');

            // Wait for Chrome to populate errors
            log('Waiting 1s for Chrome to populate errors...');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // STEP 4: Extract fresh errors
            log('STEP 4: Extract fresh errors from chrome://extensions');
            errors = await extractExtensionErrors(extensionId);

            if (errors && errors.hasErrors) {
                log(`Found ${errors.manifestErrors.length + errors.runtimeErrors.length} fresh error(s)`);
                warnings.push('Extension has errors from THIS reload');
            }

            // STEP 5: Last resort - keyboard (UNRELIABLE)
            log('STEP 5: Last resort - keyboard shortcut (UNRELIABLE)');
            const keyboardResult = await reloadViaKeyboard();
            attempts.push({
                method: 'keyboard',
                success: keyboardResult.success,
                ...keyboardResult
            });

            if (keyboardResult.success && keyboardResult.warnings) {
                warnings.push(...keyboardResult.warnings);
            }

            finalResult = keyboardResult;
        }

        logStream.end();

        // Build comprehensive JSON response
        const response = {
            success: finalResult.success,
            method: finalResult.method,
            extensionId: extensionId,
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

        // Add error field if present
        if (finalResult.error) {
            response.error = finalResult.error;
        }

        // Add warning field if present
        if (finalResult.warning) {
            if (!response.warnings) response.warnings = [];
            response.warnings.push(finalResult.warning);
        }

        console.log(JSON.stringify(response));

        process.exit(finalResult.success ? 0 : 1);

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
