#!/usr/bin/env node
/**
 * Visual Test Run Action
 *
 * Runs Jest tests with --reporter=table and outputs markdown table to stdout.
 * Provides human-readable visual output with file references.
 *
 * Usage:
 *   bin/dbg vtest-run tests/cdp/commands/cdp-create-hints.test.ts
 *   bin/dbg vtest-run tests/cdp/commands/cdp-create-hints.test.ts | less
 *
 * Output: Markdown table formatted results to stdout
 * Logs: Written to /tmp/dbg-vtest-run-<timestamp>.log
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Create log file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = `/tmp/dbg-vtest-run-${timestamp}.log`;
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

/**
 * Log to file only
 */
function log(message) {
    logStream.write(`${new Date().toISOString()} ${message}\n`);
}

/**
 * Run the test and capture table output
 */
async function runTest(testFile) {
    return new Promise((resolve) => {
        log(`Running test with table reporter: ${testFile}`);

        const proc = spawn('npm', ['run', 'test:cdp:headless', '--', '--reporter=table', testFile], {
            cwd: PROJECT_ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
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

            // Extract JSON metadata from stderr/stdout for file references
            let reportFile = null;
            let diagnosticsFile = null;
            let headlessLogFile = null;

            // Look for reportFile path in stderr/stdout
            const reportMatch = (stderr + stdout).match(/\/tmp\/cdp-test-reports\/test-report-[^\s]+\.json/);
            if (reportMatch) {
                reportFile = reportMatch[0];
            }

            const diagnosticsMatch = (stderr + stdout).match(/\/tmp\/cdp-test-reports\/test-diagnostics-[^\s]+\.json/);
            if (diagnosticsMatch) {
                diagnosticsFile = diagnosticsMatch[0];
            }

            // Extract headless log path
            const headlessMatch = (stdout).match(/Log:\s*(\S*cdp-headless[^\s]*\.log)/);
            if (headlessMatch && headlessMatch[1]) {
                headlessLogFile = headlessMatch[1];
            }

            if (stdout) {
                log(`✓ Captured table output (${stdout.length} bytes)`);
                resolve({
                    success: true,
                    table: stdout,
                    exitCode: code,
                    reportFile: reportFile,
                    diagnosticsFile: diagnosticsFile,
                    headlessLogFile: headlessLogFile
                });
            } else {
                log(`✗ No table output captured`);
                log(`Stderr: ${stderr.substring(0, 500)}`);
                resolve({
                    success: false,
                    error: 'No table output captured',
                    exitCode: code,
                    stderr: stderr.substring(0, 1000)
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
 * Format output with file references
 */
function formatOutput(result, testFile) {
    let output = '';

    output += `\n${'═'.repeat(80)}\n`;
    output += `Test: ${testFile}\n`;
    output += `${'═'.repeat(80)}\n\n`;

    output += result.table;

    output += `\n${'─'.repeat(80)}\n`;
    output += `📄 Files:\n`;
    output += `${'─'.repeat(80)}\n`;

    if (result.headlessLogFile) {
        output += `  Chrome Log:    ${result.headlessLogFile}\n`;
    }
    if (result.reportFile) {
        output += `  Full Report:   ${result.reportFile}\n`;
    }
    if (result.diagnosticsFile) {
        output += `  Diagnostics:   ${result.diagnosticsFile}\n`;
    }

    output += `\n`;

    return output;
}

/**
 * Main action runner
 */
async function run(args) {
    log('=== Visual Test Run Action ===');

    if (args.length === 0) {
        log('ERROR: No test file specified');
        logStream.end();

        console.error('Error: No test file specified');
        console.error('Usage: bin/dbg vtest-run <test-file>');
        console.error('Example: bin/dbg vtest-run tests/cdp/commands/cdp-create-hints.test.ts');
        process.exit(1);
    }

    const testFile = args[0];

    // Check if test file exists
    const testPath = path.join(PROJECT_ROOT, testFile);
    if (!fs.existsSync(testPath)) {
        log(`ERROR: Test file not found: ${testPath}`);
        logStream.end();

        console.error(`Error: Test file not found: ${testFile}`);
        process.exit(1);
    }

    log(`Test file: ${testFile}`);

    try {
        const result = await runTest(testFile);
        logStream.end();

        if (result.success) {
            // Output formatted table with file references
            console.log(formatOutput(result, testFile));
            process.exit(result.exitCode);
        } else {
            // Output error
            console.error(`\nError: ${result.error}`);
            if (result.stderr) {
                console.error(`\nStderr:\n${result.stderr}`);
            }
            process.exit(1);
        }
    } catch (error) {
        log(`FATAL ERROR: ${error.message}`);
        log(error.stack);
        logStream.end();

        console.error(`Fatal Error: ${error.message}`);
        process.exit(1);
    }
}

module.exports = { run };
