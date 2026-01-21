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
 * Preflight check: Verify required tabs exist
 */
async function checkRequiredTabs(extensionId) {
    log('Preflight: Checking required tabs...');

    const targets = await fetchJson('/json');

    // Check for chrome://extensions (for reload button)
    const extensionsTab = targets.find(t =>
        t.type === 'page' && t.url?.startsWith('chrome://extensions')
    );

    // Check for chrome://extensions/?errors=<id> (for error extraction)
    const errorsTab = targets.find(t =>
        t.type === 'page' && t.url?.includes(`chrome://extensions/?errors=${extensionId}`)
    );

    const result = {
        extensionsTab: !!extensionsTab,
        errorsTab: !!errorsTab,
        bothExist: !!extensionsTab && !!errorsTab
    };

    if (result.bothExist) {
        log('✓ Both required tabs exist');
    } else {
        if (!result.extensionsTab) log('✗ chrome://extensions tab missing');
        if (!result.errorsTab) log(`✗ chrome://extensions/?errors=${extensionId} tab missing`);
    }

    return result;
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

        // PREFLIGHT: Check required tabs
        log('PREFLIGHT: Checking required tabs...');
        const tabsCheck = await checkRequiredTabs(extensionId);

        if (!tabsCheck.bothExist) {
            log('ERROR: Required tabs not open');
            logStream.end();

            console.log(JSON.stringify({
                success: false,
                error: 'Required tabs not open',
                details: 'Please open both:\n1. chrome://extensions\n2. chrome://extensions/?errors=' + extensionId,
                preflightChecks: tabsCheck,
                log: LOG_FILE
            }));
            process.exit(1);
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
            preflightChecks: tabsCheck,
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
