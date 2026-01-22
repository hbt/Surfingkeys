/**
 * Config Set Action - Refactored Workflow
 *
 * Implements 5-step workflow: DETERMINE → CONTEXT → VALIDATE → IMPLEMENTATION → POST-VALIDATION
 *
 * - DETERMINE: Figure out which config file path to use (argument or default symlink)
 * - CONTEXT: Gather current runtime state from storage (no failures here)
 * - VALIDATE: Validate the determined path (CAN FAIL - stops before implementation)
 * - IMPLEMENTATION: Read file, calculate hash, set in storage
 * - POST-VALIDATION: Verify implementation worked (CAN FAIL - landing check)
 *
 * Usage:
 *   bin/dbg config-set                          # Uses default symlink
 *   bin/dbg config-set /path/to/config.js      # Uses provided filepath
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
const crypto = require('crypto');

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
 * Calculate SHA256 hash of file content (Node.js side)
 */
function calculateFileHash(fileContent) {
    try {
        const buffer = Buffer.from(fileContent, 'utf-8');
        const hashBuffer = crypto.createHash('sha256').update(buffer).digest();
        const hashHex = hashBuffer.toString('hex');
        return hashHex;
    } catch (err) {
        throw new Error(`Failed to calculate hash: ${err.message}`);
    }
}

/**
 * STEP 2: Gather context from storage (runtime state, no failures here)
 */
async function gatherContext(ws) {
    log(`=== STEP 2: CONTEXT - Gathering runtime state ===`);

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
                    storage: {
                        advancedMode: data.showAdvanced,
                        snippets: snippetsInfo,
                        localPath: {
                            stored: data.localPath ? 1 : 0,
                            value: data.localPath || null
                        }
                    },
                    api_available: {
                        userScriptsAvailable: !!chrome.userScripts
                    }
                });
            });
        })
    `;

    const result = await evaluateCode(ws, code);
    log(`✓ Context gathered: advancedMode=${result.storage.advancedMode}, userScriptsAvailable=${result.api_available.userScriptsAvailable}`);
    return result;
}

/**
 * STEP 3: Validate the determined filepath
 */
async function performValidation(filepath) {
    log(`=== STEP 3: VALIDATE - Validating filepath ===`);

    const validation = {
        symlink_exists: {
            required: true,
            passed: false,
            path: filepath,
            error: null
        },
        symlink_points_to_valid_file: {
            required: true,
            passed: false,
            real_path: null,
            file_exists: false,
            error: null
        },
        file_syntax_valid: {
            required: true,
            passed: false,
            error: null
        },
        all_checks_passed: false
    };

    try {
        // Handle file:// URLs
        let filePath = filepath;
        if (filepath.startsWith('file://')) {
            filePath = decodeURIComponent(new URL(filepath).pathname);
        }

        // Check 1: symlink_exists
        log(`Checking if file exists: ${filePath}`);
        if (!fs.existsSync(filePath)) {
            validation.symlink_exists.error = 'File not found';
            log(`✗ File not found: ${filePath}`);
            return validation;
        }
        validation.symlink_exists.passed = true;
        log(`✓ File exists`);

        // Check 2: symlink_points_to_valid_file
        log(`Checking if file is readable and resolving real path...`);
        try {
            const stats = fs.lstatSync(filePath);
            if (stats.isSymbolicLink()) {
                validation.symlink_points_to_valid_file.real_path = fs.realpathSync(filePath);
                log(`✓ Symlink resolved: ${filePath} -> ${validation.symlink_points_to_valid_file.real_path}`);
            } else {
                validation.symlink_points_to_valid_file.real_path = filePath;
                log(`✓ Regular file (not symlink): ${filePath}`);
            }
            validation.symlink_points_to_valid_file.file_exists = true;
            validation.symlink_points_to_valid_file.passed = true;
        } catch (err) {
            validation.symlink_points_to_valid_file.error = err.message;
            log(`✗ Failed to resolve file: ${err.message}`);
            return validation;
        }

        // Check 3: file_syntax_valid
        log(`Validating JavaScript syntax...`);
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const syntaxCheck = validateJavaScriptSyntax(fileContent);
            if (!syntaxCheck.valid) {
                validation.file_syntax_valid.error = syntaxCheck.error;
                log(`✗ Invalid JavaScript syntax: ${syntaxCheck.error}`);
                return validation;
            }
            validation.file_syntax_valid.passed = true;
            log(`✓ JavaScript syntax is valid`);
        } catch (err) {
            validation.file_syntax_valid.error = err.message;
            log(`✗ Failed to validate syntax: ${err.message}`);
            return validation;
        }

        // All checks passed
        validation.all_checks_passed = true;
        log(`✓ All validation checks passed`);
        return validation;

    } catch (err) {
        log(`✗ Validation error: ${err.message}`);
        return validation;
    }
}

/**
 * STEP 4: Set config in storage via CDP
 */
async function setConfigInStorage(ws, snippetsContent, localPathUrl) {
    log(`=== STEP 4: IMPLEMENTATION - Setting config in storage ===`);

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
        log(`✓ Config set in storage`);
        return result;
    } catch (err) {
        throw new Error(`Failed to set config: ${err.message}`);
    }
}

/**
 * STEP 5: Post-validation - verify implementation worked
 */
async function performPostValidation(ws, expectedContent, expectedPath, fileHash) {
    log(`=== STEP 5: POST-VALIDATION - Verifying implementation ===`);

    const code = `
        new Promise(async (resolve) => {
            chrome.storage.local.get(['showAdvanced', 'snippets', 'localPath'], async (data) => {
                const snippets = data.snippets || '';
                const localPath = data.localPath || '';
                const showAdvanced = data.showAdvanced || false;

                // Calculate hash of stored snippets
                let storedHash = null;
                try {
                    const encoder = new TextEncoder();
                    const buffer = encoder.encode(snippets);
                    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    storedHash = hashHex;
                } catch (e) {
                    storedHash = 'error';
                }

                resolve({
                    showAdvanced: showAdvanced,
                    snippetsLength: snippets.length,
                    snippetsHash: storedHash,
                    localPathValue: localPath
                });
            });
        })
    `;

    try {
        const stored = await evaluateCode(ws, code);

        const postValidation = {
            snippets_hash_matches_file: {
                passed: stored.snippetsHash === fileHash,
                stored_hash: stored.snippetsHash,
                file_hash: fileHash,
                error: stored.snippetsHash !== fileHash ? 'Hash mismatch' : null
            },
            advanced_mode_enabled: {
                passed: stored.showAdvanced === true,
                value: stored.showAdvanced,
                error: stored.showAdvanced !== true ? 'Advanced mode is not enabled' : null
            },
            localPath_set_correctly: {
                passed: stored.localPathValue === expectedPath,
                stored_value: stored.localPathValue,
                expected_value: expectedPath,
                error: stored.localPathValue !== expectedPath ? 'LocalPath mismatch' : null
            },
            all_checks_passed: false
        };

        postValidation.all_checks_passed =
            postValidation.snippets_hash_matches_file.passed &&
            postValidation.advanced_mode_enabled.passed &&
            postValidation.localPath_set_correctly.passed;

        if (postValidation.all_checks_passed) {
            log(`✓ Post-validation passed`);
            log(`  ✓ Snippets hash matches file`);
            log(`  ✓ Advanced mode enabled`);
            log(`  ✓ LocalPath set correctly`);
        } else {
            log(`✗ Post-validation failed`);
            if (!postValidation.snippets_hash_matches_file.passed) {
                log(`  ✗ Snippets hash mismatch: stored=${postValidation.snippets_hash_matches_file.stored_hash}, expected=${postValidation.snippets_hash_matches_file.file_hash}`);
            }
            if (!postValidation.advanced_mode_enabled.passed) {
                log(`  ✗ Advanced mode not enabled: ${postValidation.advanced_mode_enabled.value}`);
            }
            if (!postValidation.localPath_set_correctly.passed) {
                log(`  ✗ LocalPath mismatch: stored=${postValidation.localPath_set_correctly.stored_value}, expected=${postValidation.localPath_set_correctly.expected_value}`);
            }
        }

        return postValidation;

    } catch (err) {
        throw new Error(`Verification failed: ${err.message}`);
    }
}

/**
 * Main action - 5-step workflow
 */
async function run(args) {
    log(`\n=== Config Set Action Started ===`);

    try {
        // === STEP 1: DETERMINE ===
        log(`=== STEP 1: DETERMINE - Resolving config filepath ===`);

        let filepath = args && args[0] ? args[0] : null;
        let source = 'default_symlink';

        if (filepath) {
            source = 'argument';
            log(`Using provided filepath: ${filepath}`);
        } else {
            filepath = DEFAULT_CONFIG_SYMLINK;
            log(`Using default symlink: ${filepath}`);
        }

        // Convert to file:// URL if it's a local path
        let filepathUrl = filepath;
        if (!filepath.startsWith('file://') && !filepath.startsWith('http')) {
            filepathUrl = `file://${filepath}`;
        }

        const determine = {
            source: source,
            filepath: filepath,
            repo_default_symlink: DEFAULT_CONFIG_SYMLINK
        };

        log(`✓ DETERMINE step complete: source=${source}, filepath=${filepath}`);

        // Find and connect to service worker
        log(`Finding Surfingkeys service worker...`);
        const swWsUrl = await findServiceWorker();

        if (!swWsUrl) {
            log(`✗ Service worker not found`);
            logStream.end();
            console.log(JSON.stringify({
                success: false,
                error: 'Surfingkeys extension not found. Is it loaded? Try: npm run esbuild:dev && ./bin/dbg reload',
                determine: determine,
                log: LOG_FILE
            }));
            process.exit(1);
        }

        log(`✓ Service worker found`);

        // Connect to service worker (keep connection open for all steps)
        log(`Connecting to service worker via CDP...`);
        const ws = new WebSocket(swWsUrl);

        // Wrap in promise to handle async operations
        const response = await new Promise(async (resolve) => {
            ws.on('open', async () => {
                try {
                    log(`✓ Connected to service worker`);

                    // Enable Runtime domain
                    await sendCommand(ws, 'Runtime.enable');
                    log(`✓ Runtime domain enabled`);

                    // === STEP 2: CONTEXT ===
                    const context = await gatherContext(ws);
                    log(`✓ CONTEXT step complete`);

                    // === STEP 3: VALIDATE ===
                    const validate = await performValidation(filepathUrl);

                    if (!validate.all_checks_passed) {
                        log(`✗ Validation failed - stopping before implementation`);
                        ws.close();

                        logStream.end();
                        resolve({
                            success: false,
                            error: 'Validation failed',
                            determine: determine,
                            context: context,
                            validate: validate,
                            log: LOG_FILE
                        });
                        return;
                    }

                    log(`✓ VALIDATE step complete - all checks passed`);

                    // === STEP 4: IMPLEMENTATION ===
                    log(`=== STEP 4: IMPLEMENTATION - Reading and setting config ===`);

                    // Read file content
                    let filePath = filepath;
                    if (filepath.startsWith('file://')) {
                        filePath = decodeURIComponent(new URL(filepath).pathname);
                    }

                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    const fileHash = calculateFileHash(fileContent);
                    log(`✓ Read file: ${fileContent.length} bytes, hash=${fileHash}`);

                    // Set config in storage
                    await setConfigInStorage(ws, fileContent, filepathUrl);

                    const implementation = {
                        file_content_size: fileContent.length,
                        file_hash: fileHash,
                        snippets_set: true,
                        localPath_set: true
                    };

                    log(`✓ IMPLEMENTATION step complete`);

                    // === STEP 5: POST-VALIDATION ===
                    const postValidation = await performPostValidation(ws, fileContent, filepathUrl, fileHash);

                    log(`✓ POST-VALIDATION step complete`);

                    ws.close();

                    logStream.end();
                    resolve({
                        success: postValidation.all_checks_passed,
                        determine: determine,
                        context: context,
                        validate: validate,
                        implementation: implementation,
                        post_validation: postValidation,
                        log: LOG_FILE
                    });

                } catch (error) {
                    log(`✗ Error during workflow: ${error.message}`);
                    log(error.stack);
                    ws.close();
                    logStream.end();
                    resolve({
                        success: false,
                        error: error.message,
                        determine: determine,
                        log: LOG_FILE
                    });
                }
            });

            ws.on('error', (error) => {
                log(`✗ WebSocket error: ${error.message}`);
                logStream.end();
                resolve({
                    success: false,
                    error: `WebSocket error: ${error.message}`,
                    determine: determine,
                    log: LOG_FILE
                });
            });
        });

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
