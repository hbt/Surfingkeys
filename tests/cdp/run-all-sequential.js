#!/usr/bin/env node
/**
 * Sequential CDP Test Runner with Retry Logic
 *
 * Runs all CDP tests sequentially (one at a time).
 * If a test fails, retries it once to detect flaky tests.
 *
 * Output categories:
 * - PASS: Test passed on first attempt
 * - FLAKY: Test failed on first attempt, passed on retry
 * - FAIL: Test failed on both attempts
 *
 * Usage:
 *   node tests/cdp/run-all-sequential.js
 *   npm run test:cdp:headless:seq
 */

const { execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Config server management
let configServer = null;
const CONFIG_SERVER_PORT = 9874;
const FIXTURES_DIR = path.join(__dirname, '../../data/fixtures');

async function startConfigServer(filename) {
    return new Promise((resolve, reject) => {
        const filePath = `/${filename}`;
        const fullPath = path.join(FIXTURES_DIR, filename);

        // Verify file exists
        if (!fs.existsSync(fullPath)) {
            reject(new Error(`Config fixture not found: ${fullPath}`));
            return;
        }

        configServer = http.createServer((req, res) => {
            const urlPath = (req.url || '').split('?')[0];

            if (urlPath === filePath) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    res.writeHead(200, { 'Content-Type': 'application/javascript' });
                    res.end(content);
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('500 Internal Server Error');
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            }
        });

        configServer.listen(CONFIG_SERVER_PORT, '127.0.0.1', () => {
            resolve(`http://127.0.0.1:${CONFIG_SERVER_PORT}${filePath}`);
        });

        configServer.on('error', reject);
    });
}

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

function log(message, color = '') {
    console.log(`${color}${message}${colors.reset}`);
}

function runTest(testFile) {
    try {
        execSync(`npm run test:cdp:headless ${testFile}`, {
            stdio: 'inherit',
            encoding: 'utf8'
        });
        return { success: true, exitCode: 0 };
    } catch (error) {
        return { success: false, exitCode: error.status || 1 };
    }
}

async function main() {
    const testsDir = path.join(__dirname);

    // Use find command to discover all .test.ts files recursively (including subdirectories)
    const findCommand = `find ${testsDir} -name '*.test.ts' -type f`;
    let testFiles = [];
    try {
        const output = execSync(findCommand, { encoding: 'utf8' });
        testFiles = output
            .trim()
            .split('\n')
            .filter(f => f.length > 0)
            .sort();
    } catch (error) {
        log(`❌ Error discovering test files: ${error.message}`, colors.red);
        process.exit(1);
    }

    if (testFiles.length === 0) {
        log('❌ No test files found in tests/cdp/', colors.red);
        process.exit(1);
    }

    log('\n' + '='.repeat(70), colors.cyan);
    log('Sequential CDP Test Runner with Retry Logic', colors.cyan);
    log('='.repeat(70), colors.cyan);
    log(`Found ${testFiles.length} test file(s)\n`, colors.cyan);

    // Start config server
    try {
        const configUrl = await startConfigServer('cdp-scrollstepsize-config.js');
        log(`✓ Config server started: ${configUrl}`, colors.green);
    } catch (error) {
        log(`❌ Failed to start config server: ${error.message}`, colors.red);
        process.exit(1);
    }

    const results = {
        pass: [],
        flaky: [],
        fail: []
    };

    for (let i = 0; i < testFiles.length; i++) {
        const testFile = testFiles[i];
        const testName = path.basename(testFile);

        log(`\n[${ i + 1}/${testFiles.length}] Running: ${testName}`, colors.cyan);
        log('─'.repeat(70), colors.dim);

        // First attempt
        const firstAttempt = runTest(testFile);

        if (firstAttempt.success) {
            log(`✅ PASS: ${testName}`, colors.green);
            results.pass.push(testName);
        } else {
            log(`❌ Failed on first attempt, retrying...`, colors.yellow);

            // Second attempt (retry)
            const secondAttempt = runTest(testFile);

            if (secondAttempt.success) {
                log(`⚠️  FLAKY: ${testName} (failed first, passed on retry)`, colors.yellow);
                results.flaky.push(testName);
            } else {
                log(`❌ FAIL: ${testName} (failed both attempts)`, colors.red);
                results.fail.push(testName);
            }
        }
    }

    // Summary
    log('\n' + '='.repeat(70), colors.cyan);
    log('Test Summary', colors.cyan);
    log('='.repeat(70), colors.cyan);

    log(`\n✅ PASSED: ${results.pass.length}`, colors.green);
    results.pass.forEach(test => log(`   - ${test}`, colors.dim));

    if (results.flaky.length > 0) {
        log(`\n⚠️  FLAKY: ${results.flaky.length}`, colors.yellow);
        results.flaky.forEach(test => log(`   - ${test}`, colors.dim));
    }

    if (results.fail.length > 0) {
        log(`\n❌ FAILED: ${results.fail.length}`, colors.red);
        results.fail.forEach(test => log(`   - ${test}`, colors.dim));
    }

    const total = testFiles.length;
    const passed = results.pass.length;
    const flaky = results.flaky.length;
    const failed = results.fail.length;

    log('\n' + '─'.repeat(70), colors.dim);
    log(`Total: ${total} | Passed: ${passed} | Flaky: ${flaky} | Failed: ${failed}\n`, colors.cyan);

    // Exit code: 0 if no failures, 1 if any failures
    const exitCode = results.fail.length > 0 ? 1 : 0;
    process.exit(exitCode);
}

main().catch(err => {
    log(`\n❌ Fatal error: ${err.message}`, colors.red);
    console.error(err);
    process.exit(1);
});
