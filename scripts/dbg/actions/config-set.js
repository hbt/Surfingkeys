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
 * - localPath: Information about external config source
 *   - stored: Whether localPath key exists (0 or 1)
 *   - value: The path/URL (or default symlink if not stored)
 *   - realPath: Resolved real path (if symlink)
 *   - isSymlink: Whether the path is a symbolic link
 *   - fileExists: Validates file existence
 *   - syntaxValid: Validates JavaScript syntax
 *   - default: Whether using default symlink (.surfingkeysrc.js)
 *   - symlink: The symlink path used (if default)
 *
 * Default Behavior:
 * - If no localPath stored: uses .surfingkeysrc.js symlink as default
 * - Automatically resolves symlinks to real paths
 *
 * Usage: bin/dbg config-set
 *
 * Output: JSON only to stdout
 * Logs: Written to /tmp/dbg-config-set-<timestamp>.log
 */

const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let messageId = 1;
const CDP_PORT = process.env.CDP_PORT || 9222;
const CDP_ENDPOINT = `http://localhost:${CDP_PORT}`;

// Default config symlink location (repo root)
const DEFAULT_CONFIG_SYMLINK = path.join(__dirname, '../../../.surfingkeysrc.js');

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
 * Validate JavaScript syntax using Node.js
 */
function validateJavaScriptSyntax(code) {
    try {
        new vm.Script(code);
        return { valid: true, error: null };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

/**
 * Validate localPath file: check existence and syntax
 */
async function validateLocalPath(localPath) {
    const info = {
        stored: localPath ? 1 : 0,
        value: localPath || null,
        realPath: null,
        isSymlink: false,
        fileExists: null,
        syntaxValid: null,
        length: null,
        error: null
    };

    if (!localPath) {
        return info;
    }

    // Handle file:// URLs
    if (localPath.startsWith('file://')) {
        try {
            // Convert file:// URL to path
            const filePath = decodeURIComponent(new URL(localPath).pathname);
            log(`Validating file: ${filePath}`);

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                info.fileExists = false;
                info.error = 'File not found';
                return info;
            }

            info.fileExists = true;

            // Check if it's a symlink and resolve real path
            try {
                const stats = fs.lstatSync(filePath);
                if (stats.isSymbolicLink()) {
                    info.isSymlink = true;
                    info.realPath = fs.realpathSync(filePath);
                    log(`Symlink detected: ${filePath} -> ${info.realPath}`);
                } else {
                    info.realPath = filePath;
                }
            } catch (err) {
                info.realPath = filePath;
            }

            // Read file
            const content = fs.readFileSync(filePath, 'utf-8');
            info.length = content.length;

            // Validate syntax
            const syntaxCheck = validateJavaScriptSyntax(content);
            info.syntaxValid = syntaxCheck.valid;
            if (!syntaxCheck.valid) {
                info.error = syntaxCheck.error;
            }

            return info;
        } catch (err) {
            info.fileExists = false;
            info.error = err.message;
            return info;
        }
    }

    // For HTTP/HTTPS URLs, skip validation (would require network fetch)
    info.error = 'HTTP/HTTPS validation not performed (skipped for preflight)';

    return info;
}

/**
 * Collect preflight checks from storage: advancedMode, userScripts, snippets
 */
async function getPreflightChecksFromStorage(ws) {
    log(`Collecting preflight checks from storage...`);

    const code = `
        new Promise(async (resolve) => {
            chrome.storage.local.get(['showAdvanced', 'snippets', 'localPath'], async (data) => {
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
                    snippets: snippetsInfo,
                    localPath: data.localPath || null
                });
            });
        })
    `;

    const result = await evaluateCode(ws, code);
    return result;
}

/**
 * Set snippets and localPath in storage via CDP
 */
async function setConfigInStorage(ws, snippetsContent, localPathUrl) {
    log(`Setting config in storage...`);

    const code = `
        new Promise((resolve, reject) => {
            const toSet = {
                snippets: \`${snippetsContent.replace(/`/g, '\\`')}\`,
                localPath: '${localPathUrl.replace(/'/g, "\\'")}'
            };

            chrome.storage.local.set(toSet, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve({ success: true });
                }
            });
        })
    `;

    try {
        const result = await evaluateCode(ws, code);
        return result;
    } catch (err) {
        throw new Error(`Failed to set config: ${err.message}`);
    }
}

/**
 * Post-verification: read back from storage and verify
 */
async function verifyConfigSet(ws, expectedContent, expectedPath) {
    log(`Verifying config was set correctly...`);

    const code = `
        new Promise(async (resolve) => {
            chrome.storage.local.get(['snippets', 'localPath'], async (data) => {
                const snippets = data.snippets || '';
                const localPath = data.localPath || '';

                // Calculate hash of stored snippets
                let hash = null;
                try {
                    const encoder = new TextEncoder();
                    const buffer = encoder.encode(snippets);
                    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    hash = hashHex;
                } catch (e) {
                    hash = 'error';
                }

                resolve({
                    snippetsMatches: snippets === \`${expectedContent.replace(/`/g, '\\`')}\`,
                    snippetsLength: snippets.length,
                    snippetsHash: hash,
                    localPathMatches: localPath === '${expectedPath.replace(/'/g, "\\'")}',
                    localPathValue: localPath,
                    stored: !!snippets && !!localPath
                });
            });
        })
    `;

    try {
        const result = await evaluateCode(ws, code);
        return result;
    } catch (err) {
        throw new Error(`Verification failed: ${err.message}`);
    }
}

/**
 * Main action
 */
async function run(args) {
    log(`Config Set Action Started`);

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

                    // Collect preflight checks from storage
                    const storageChecks = await getPreflightChecksFromStorage(ws);
                    log(`✓ Storage checks collected`);

                    ws.close();

                    // Determine localPath: use stored value or default symlink
                    let localPathToValidate = storageChecks.localPath;
                    let usingDefault = false;
                    let defaultSymlink = null;

                    if (!localPathToValidate) {
                        // Check if default symlink exists
                        if (fs.existsSync(DEFAULT_CONFIG_SYMLINK)) {
                            usingDefault = true;
                            defaultSymlink = DEFAULT_CONFIG_SYMLINK;
                            localPathToValidate = `file://${DEFAULT_CONFIG_SYMLINK}`;
                            log(`Using default symlink: ${DEFAULT_CONFIG_SYMLINK}`);
                        }
                    }

                    // Validate localPath on Node side
                    log(`Validating localPath on Node side...`);
                    const localPathInfo = await validateLocalPath(localPathToValidate);
                    if (usingDefault) {
                        localPathInfo.default = true;
                        localPathInfo.symlink = defaultSymlink;
                    }
                    log(`✓ LocalPath validation complete`);

                    const preflightChecks = {
                        advancedMode: storageChecks.advancedMode,
                        userScriptsAvailable: storageChecks.userScriptsAvailable,
                        snippets: storageChecks.snippets,
                        localPath: localPathInfo
                    };

                    // === VALIDATION GATES ===
                    log(`\n=== Validation gates (must pass before implementation) ===`);
                    const validationGates = {
                        advancedModeOn: storageChecks.advancedMode === true,
                        localPathValid: localPathInfo.fileExists === true && localPathInfo.syntaxValid === true,
                        issues: []
                    };

                    if (!validationGates.advancedModeOn) {
                        validationGates.issues.push('Advanced mode is OFF (showAdvanced: false)');
                    }
                    if (!validationGates.localPathValid) {
                        if (localPathInfo.fileExists !== true) {
                            validationGates.issues.push(`File not found: ${localPathInfo.value}`);
                        }
                        if (localPathInfo.syntaxValid !== true) {
                            validationGates.issues.push(`Invalid JavaScript syntax: ${localPathInfo.error}`);
                        }
                    }

                    if (!validationGates.advancedModeOn || !validationGates.localPathValid) {
                        log(`✗ Validation FAILED:`);
                        validationGates.issues.forEach(issue => log(`  - ${issue}`));

                        resolve({
                            success: false,
                            error: 'Validation gates failed - config not set',
                            preflight: preflightChecks,
                            validation_gates: validationGates,
                            log: LOG_FILE
                        });
                        return;
                    }

                    log(`✓ All validation gates passed`);
                    log(`  ✓ Advanced mode: ON`);
                    log(`  ✓ LocalPath: valid`);
                    log(`  ✓ File syntax: valid`);

                    // === SET CONFIG ===
                    log(`\n=== Setting config in storage ===`);

                    // Reopen WebSocket for setting
                    const wsSet = new WebSocket(swWsUrl);

                    await new Promise(async (resolveSet) => {
                        wsSet.on('open', async () => {
                            try {
                                await sendCommand(wsSet, 'Runtime.enable');

                                // Read file content
                                const filePath = decodeURIComponent(new URL(localPathToValidate).pathname);
                                const fileContent = fs.readFileSync(filePath, 'utf-8');
                                log(`✓ Read file content: ${fileContent.length} bytes`);

                                // Set config via CDP
                                await setConfigInStorage(wsSet, fileContent, localPathToValidate);
                                log(`✓ Config set in storage`);

                                // Post-verification
                                log(`\n=== Post-verification ===`);
                                const verification = await verifyConfigSet(wsSet, fileContent, localPathToValidate);
                                log(`✓ Verification complete:`);
                                log(`  - Snippets matches: ${verification.snippetsMatches}`);
                                log(`  - LocalPath matches: ${verification.localPathMatches}`);
                                log(`  - Snippets hash: ${verification.snippetsHash}`);

                                wsSet.close();

                                resolveSet({
                                    success: verification.snippetsMatches && verification.localPathMatches,
                                    preflight: preflightChecks,
                                    validation_gates: validationGates,
                                    implementation: {
                                        fileSize: fileContent.length,
                                        snippetsSet: true,
                                        localPathSet: true
                                    },
                                    verification: verification,
                                    log: LOG_FILE
                                });

                            } catch (error) {
                                log(`✗ Error during set: ${error.message}`);
                                wsSet.close();
                                resolveSet({
                                    success: false,
                                    error: error.message,
                                    preflight: preflightChecks,
                                    log: LOG_FILE
                                });
                            }
                        });

                        wsSet.on('error', (error) => {
                            log(`✗ WebSocket error during set: ${error.message}`);
                            resolveSet({
                                success: false,
                                error: `WebSocket error: ${error.message}`,
                                log: LOG_FILE
                            });
                        });
                    }).then(result => resolve(result));


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
