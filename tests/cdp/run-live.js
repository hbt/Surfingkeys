#!/usr/bin/env node
/**
 * Live CDP Test Runner
 *
 * Runs CDP tests against an existing Chrome instance with remote debugging
 * enabled on port 9222. Does not launch or manage Chrome.
 *
 * Features:
 * - Uses existing Chrome at port 9222
 * - Checks for fixtures server and starts if needed
 * - Same Jest streaming reporter as headless mode
 * - No Chrome cleanup (user manages their own instance)
 *
 * Prerequisites:
 *   Chrome must be running with debug mode:
 *   google-chrome-beta --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
 *
 * Usage:
 *   node tests/cdp/run-live.js tests/cdp/cdp-keyboard.test.ts
 *   npm run test:cdp:live tests/cdp/cdp-keyboard.test.ts
 */

const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

// Log file setup
const timestamp = new Date().toISOString().split('T')[0];
const uniqueId = Math.random().toString(36).substring(2, 8);
const LOG_FILE = `/tmp/cdp-live-${timestamp}-${uniqueId}.log`;
let logStream = null;

function log(message, stdoutAlso = false) {
    if (logStream) {
        logStream.write(message + '\n');
    }
    if (stdoutAlso) {
        console.log(message);
    }
}

async function checkFixturesServer(port = 9873) {
    return new Promise((resolve) => {
        const req = require('http').get(`http://127.0.0.1:${port}/health`, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function startFixturesServer() {
    const fixturesServerPath = path.join(__dirname, '../fixtures-server.js');

    log('Starting fixtures server...');

    const server = spawn('node', [fixturesServerPath], {
        stdio: 'ignore',
        detached: true
    });

    server.unref();

    // Wait for server to be ready
    for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        if (await checkFixturesServer()) {
            log(`Fixtures server started (PID: ${server.pid})`);
            return server.pid;
        }
    }

    throw new Error('Fixtures server failed to start');
}

async function checkChromeDebugger(port = 9222) {
    return new Promise((resolve) => {
        const req = require('http').get(`http://localhost:${port}/json/version`, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function checkSurfingkeysExtension(port = 9222) {
    return new Promise((resolve) => {
        const req = require('http').get(`http://localhost:${port}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const targets = JSON.parse(body);
                    const hasExtension = targets.some(t =>
                        t.title === 'Surfingkeys' ||
                        t.url.includes('_generated_background_page.html') ||
                        (t.type === 'service_worker' && t.url.includes('background.js'))
                    );
                    resolve(hasExtension);
                } catch (err) {
                    resolve(false);
                }
            });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function main() {
    const testFile = process.argv[2];

    if (!testFile) {
        console.error('❌ Usage: node run-live.js <test-file>');
        console.error('   Example: node run-live.js tests/cdp/cdp-keyboard.test.ts');
        process.exit(1);
    }

    const testPath = path.resolve(testFile);
    if (!fs.existsSync(testPath)) {
        console.error(`❌ Test file not found: ${testPath}`);
        process.exit(1);
    }

    // Initialize log file
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
    log('=== CDP Live Test Runner ===');
    log(`Started: ${new Date().toISOString()}`);
    log(`Test file: ${testFile}`);
    log(`Log file: ${LOG_FILE}\n`);

    // Brief stdout message
    console.log(`Running live: ${path.basename(testFile)}`);
    console.log(`Log: ${LOG_FILE}\n`);

    // Check if extension is built
    const extDir = path.join(__dirname, '../../dist/development/chrome');
    if (!fs.existsSync(extDir)) {
        console.error('❌ Surfingkeys extension not found at:', extDir);
        console.error('   Please build the extension first: npm run build:dev');
        logStream.end();
        process.exit(1);
    }

    // Check if Chrome debugger is available on port 9222
    log('Checking for Chrome debugger on port 9222...');
    const chromeAvailable = await checkChromeDebugger(9222);

    if (!chromeAvailable) {
        const errorMsg = `
❌ Chrome debugger not available on port 9222

Please start Chrome with remote debugging enabled:

  google-chrome-beta --remote-debugging-port=9222

Note: Use your default Chrome profile (not a temporary one) so the extension
persists across restarts. You'll need to manually load the extension once.
`;
        console.error(errorMsg);
        log(errorMsg);
        logStream.end();
        process.exit(1);
    }

    log('Chrome debugger is available on port 9222');

    // Verify Surfingkeys extension is loaded
    log('Checking if Surfingkeys extension is loaded...');
    const extensionLoaded = await checkSurfingkeysExtension();

    if (!extensionLoaded) {
        const errorMsg = `
❌ Surfingkeys extension not found in Chrome

The Chrome debugger is available, but Surfingkeys extension is not loaded.

One-time setup - load the extension manually:
  1. Open chrome://extensions/ in your Chrome browser
  2. Enable "Developer mode" (toggle in top right)
  3. Click "Load unpacked"
  4. Select directory: ${extDir}

After loading once, the extension will persist in your profile for future test runs.
`;
        console.error(errorMsg);
        log(errorMsg);
        logStream.end();
        process.exit(1);
    }

    log('Surfingkeys extension is loaded');

    // Check/start fixtures server
    let fixturesServerPid = null;
    const fixturesServerRunning = await checkFixturesServer();

    if (fixturesServerRunning) {
        log('Fixtures server already running');
    } else {
        fixturesServerPid = await startFixturesServer();
    }

    // Detect if this is a Jest test file or standalone script
    const isJestTest = testPath.endsWith('.test.ts');
    const command = isJestTest ? 'jest' : 'ts-node';
    const streamingReporter = path.join(__dirname, 'streaming-reporter.js');
    const args = isJestTest
        ? ['--config=config/jest.config.cdp.js', '--reporters', streamingReporter, '--', testPath]
        : [testPath];

    log(`\nRunning test...`);
    log(`  Test: ${testFile}`);
    log(`  CDP_PORT: 9222`);
    log(`  Runner: ${command}\n`);

    const testProcess = spawn('npx', [command, ...args], {
        env: {
            ...process.env,
            CDP_PORT: '9222',
            FORCE_COLOR: '1'  // Ensure colored output
        },
        stdio: ['inherit', 'inherit', 'inherit']  // Explicitly inherit all streams
    });

    // Handle test completion
    const testExitCode = await new Promise((resolve) => {
        testProcess.on('exit', (code) => {
            resolve(code);
        });
    });

    log('\n' + '='.repeat(60));
    log('Test completed with exit code: ' + testExitCode);

    // Cleanup
    log('\nCleaning up...');

    // Kill fixtures server if we started it
    if (fixturesServerPid) {
        try {
            process.kill(fixturesServerPid, 'SIGTERM');
            log(`Killed fixtures server (PID: ${fixturesServerPid})`);
        } catch (err) {
            log(`Fixtures server process may have already exited: ${err.message}`);
        }
    }

    log('Cleanup complete\n');

    // Close log stream
    if (logStream) {
        logStream.end();
    }

    // Brief final message
    if (testExitCode === 0) {
        console.log(`✅ Tests passed\n`);
    } else {
        console.log(`❌ Tests failed (exit code: ${testExitCode})\n`);
    }

    // Exit with same code as test
    process.exit(testExitCode || 0);
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
