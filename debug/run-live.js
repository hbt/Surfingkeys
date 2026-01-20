#!/usr/bin/env node
/**
 * Debug Live Runner
 *
 * Runs debug scripts against an existing Chrome instance with remote debugging
 * enabled on port 9222. Does not launch or manage Chrome.
 *
 * Features:
 * - Uses existing Chrome at port 9222
 * - Checks for fixtures server and starts if needed
 * - No Chrome cleanup (user manages their own instance)
 * - Always uses ts-node (not Jest)
 *
 * Prerequisites:
 *   Chrome must be running with debug mode:
 *   google-chrome-beta --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
 *
 * Usage:
 *   node debug/run-live.js debug/cdp-debug-show-current-state.ts
 */

const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

// Log file setup
const timestamp = new Date().toISOString().split('T')[0];
const uniqueId = Math.random().toString(36).substring(2, 8);
const LOG_FILE = `/tmp/cdp-debug-live-${timestamp}-${uniqueId}.log`;
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
        const req = require('http').get(`http://127.0.0.1:${port}/hackernews.html`, (res) => {
            resolve(res.statusCode === 200 || res.statusCode === 304);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function startFixturesServer() {
    const fixturesServerPath = path.join(__dirname, '../tests/fixtures-server.js');

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
    const scriptFile = process.argv[2];

    if (!scriptFile) {
        console.error('Usage: node run-live.js <script-file>');
        console.error('   Example: node run-live.js debug/cdp-debug-show-current-state.ts');
        process.exit(1);
    }

    const scriptPath = path.resolve(scriptFile);
    if (!fs.existsSync(scriptPath)) {
        console.error(`Script file not found: ${scriptPath}`);
        process.exit(1);
    }

    // Initialize log file
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
    log('=== Debug Live Runner ===');
    log(`Started: ${new Date().toISOString()}`);
    log(`Script file: ${scriptFile}`);
    log(`Log file: ${LOG_FILE}\n`);

    // Brief stdout message
    console.log(`Running live: ${path.basename(scriptFile)}`);
    console.log(`Log: ${LOG_FILE}\n`);

    // Check if extension is built
    const extDir = path.join(__dirname, '../dist-esbuild/development/chrome');
    if (!fs.existsSync(extDir)) {
        console.error('Surfingkeys extension not found at:', extDir);
        console.error('   Please build the extension first: npm run esbuild:dev');
        logStream.end();
        process.exit(1);
    }

    // Check if Chrome debugger is available on port 9222
    log('Checking for Chrome debugger on port 9222...');
    const chromeAvailable = await checkChromeDebugger(9222);

    if (!chromeAvailable) {
        const errorMsg = `
Chrome debugger not available on port 9222

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
Surfingkeys extension not found in Chrome

The Chrome debugger is available, but Surfingkeys extension is not loaded.

One-time setup - load the extension manually:
  1. Open chrome://extensions/ in your Chrome browser
  2. Enable "Developer mode" (toggle in top right)
  3. Click "Load unpacked"
  4. Select directory: ${extDir}

After loading once, the extension will persist in your profile for future runs.
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

    // Always use ts-node for debug scripts
    log(`\nRunning debug script...`);
    log(`  Script: ${scriptFile}`);
    log(`  CDP_PORT: 9222`);
    log(`  Runner: ts-node\n`);

    const scriptProcess = spawn('npx', ['ts-node', scriptPath], {
        env: {
            ...process.env,
            CDP_PORT: '9222',
            FORCE_COLOR: '1'
        },
        stdio: ['inherit', 'inherit', 'inherit']
    });

    // Handle script completion
    const scriptExitCode = await new Promise((resolve) => {
        scriptProcess.on('exit', (code) => {
            resolve(code);
        });
    });

    log('\n' + '='.repeat(60));
    log('Script completed with exit code: ' + scriptExitCode);

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
    if (scriptExitCode === 0) {
        console.log(`Script completed successfully\n`);
    } else {
        console.log(`Script failed (exit code: ${scriptExitCode})\n`);
    }

    // Exit with same code as script
    process.exit(scriptExitCode || 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
