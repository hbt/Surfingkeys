/**
 * Test Run Action
 *
 * Runs Jest tests with --reporter=json and outputs ONLY the JSON to stdout.
 * Filters out npm and build noise to ensure clean JSON output for piping to jq.
 *
 * Usage:
 *   bin/dbg test-run tests/cdp/commands/cdp-create-hints.test.ts
 *   bin/dbg test-run tests/cdp/commands/cdp-create-hints.test.ts | jq .
 *
 * Output: JSON only to stdout (no npm noise, no logs)
 * Logs: Written to /tmp/dbg-test-run-<timestamp>.log
 */

// TODO(hbt) NEXT [tests] add esbuild:dev before running tests

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Create log file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = `/tmp/dbg-test-run-${timestamp}.log`;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Log to file only
 */
function log(message) {
    logStream.write(`${new Date().toISOString()} ${message}\n`);
}

/**
 * Extract headless log file path from output
 * Looks for pattern: "Log: /tmp/cdp-headless-*.log"
 * Returns path or null if not found
 */
function extractHeadlessLogPath(output) {
    // Remove ANSI color codes
    const clean = output.replace(/\u001b\[[0-9;]*m/g, '');

    // Look for "Log: /tmp/cdp-headless-*.log" pattern
    const match = clean.match(/Log:\s*(\S*cdp-headless[^\s]*\.log)/);
    if (match && match[1]) {
        return match[1];
    }

    return null;
}

/**
 * Extract JSON from mixed output (handles npm noise)
 * Returns extracted JSON or null if not found
 */
function extractJSON(output) {
    // Remove ANSI color codes
    const clean = output.replace(/\u001b\[[0-9;]*m/g, '');

    // Try to find JSON object starting with { and ending with }
    // Find the first { and the last }
    const firstBrace = clean.indexOf('{');
    if (firstBrace === -1) {
        return null;
    }

    const lastBrace = clean.lastIndexOf('}');
    if (lastBrace === -1 || lastBrace < firstBrace) {
        return null;
    }

    const jsonStr = clean.substring(firstBrace, lastBrace + 1);

    try {
        return JSON.parse(jsonStr);
    } catch (err) {
        log(`JSON parse error: ${err.message}`);
        log(`Attempted to parse: ${jsonStr.substring(0, 200)}...`);
        return null;
    }
}

/**
 * Run the test and capture JSON output
 */
async function runTest(testFile) {
    return new Promise((resolve) => {
        log(`Running test: ${testFile}`);

        const proc = spawn('bun', ['tests/cdp/run-headless.js', '--reporter=json', testFile], {
            cwd: PROJECT_ROOT,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            log(`Test process exited with code: ${code}`);
            log(`Stdout length: ${stdout.length} bytes`);
            log(`Stderr length: ${stderr.length} bytes`);

            // Log first 500 chars of output for debugging
            if (stdout) {
                log(`Stdout preview: ${stdout.substring(0, 500)}`);
            }
            if (stderr) {
                log(`Stderr preview: ${stderr.substring(0, 500)}`);
            }

            // Extract headless log path (appears in stdout)
            const headlessLogFile = extractHeadlessLogPath(stdout);
            if (headlessLogFile) {
                log(`✓ Found headless log: ${headlessLogFile}`);
            }

            // Try to extract JSON from stdout first, then stderr
            let json = null;
            let source = 'stdout';

            if (stdout) {
                json = extractJSON(stdout);
            }

            if (!json && stderr) {
                json = extractJSON(stderr);
                source = 'stderr';
            }

            if (json) {
                log(`✓ Successfully extracted JSON from ${source}`);

                // Add headless log path to JSON output if found
                if (headlessLogFile) {
                    json.headlessLogFile = headlessLogFile;
                }

                resolve({
                    success: true,
                    json: json,
                    exitCode: code,
                    source: source
                });
            } else {
                log(`✗ Could not extract JSON from output`);
                log(`Raw stdout: ${stdout}`);
                log(`Raw stderr: ${stderr}`);
                resolve({
                    success: false,
                    error: 'Could not extract JSON from test output',
                    exitCode: code,
                    rawOutput: {
                        stdout: stdout.substring(0, 1000),
                        stderr: stderr.substring(0, 1000)
                    }
                });
            }
        });

        proc.on('error', (error) => {
            log(`✗ Process error: ${error.message}`);
            resolve({
                success: false,
                error: error.message,
                exitCode: -1
            });
        });
    });
}

/**
 * Main action runner
 */
async function run(args) {
    log('=== Test Run Action ===');

    if (args.length === 0) {
        log('ERROR: No test file specified');
        logStream.end();

        console.log(JSON.stringify({
            success: false,
            error: 'No test file specified',
            usage: 'bin/dbg test-run <test-file>',
            example: 'bin/dbg test-run tests/cdp/commands/cdp-create-hints.test.ts',
            log: LOG_FILE
        }));
        process.exit(1);
    }

    const testFile = args[0];

    // Check if test file exists
    const testPath = path.join(PROJECT_ROOT, testFile);
    if (!fs.existsSync(testPath)) {
        log(`ERROR: Test file not found: ${testPath}`);
        logStream.end();

        console.log(JSON.stringify({
            success: false,
            error: `Test file not found: ${testFile}`,
            log: LOG_FILE
        }));
        process.exit(1);
    }

    log(`Test file: ${testFile}`);

    try {
        const result = await runTest(testFile);
        logStream.end();

        if (result.success) {
            // Output ONLY the JSON from the test (no additional wrapper)
            console.log(JSON.stringify(result.json));
            process.exit(result.exitCode);
        } else {
            // If we failed to extract JSON, output our error wrapped in JSON
            console.log(JSON.stringify(result));
            process.exit(1);
        }
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
