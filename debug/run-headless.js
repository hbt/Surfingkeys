#!/usr/bin/env node
/**
 * Debug Headless Runner
 *
 * Launches Chrome in headless mode with isolated profile and dynamic port,
 * runs a debug script, then cleans up.
 *
 * Features:
 * - Dynamic port allocation (finds available port starting from 9400)
 * - Unique temporary user data directory
 * - Automatic Chrome cleanup after script
 * - Port passed to script via CDP_PORT environment variable
 * - Always uses ts-node (not Jest)
 *
 * Usage:
 *   node debug/run-headless.js debug/cdp-debug-verify-working.ts
 */

const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Log file setup
const timestamp = new Date().toISOString().split('T')[0];
const uniqueId = Math.random().toString(36).substring(2, 8);
const LOG_FILE = `/tmp/cdp-debug-headless-${timestamp}-${uniqueId}.log`;
let logStream = null;

function log(message, stdoutAlso = false) {
    if (logStream) {
        logStream.write(message + '\n');
    }
    if (stdoutAlso) {
        console.log(message);
    }
}

// Find an available port starting from the given port
async function findAvailablePort(startPort = 9400, maxAttempts = 100) {
    for (let port = startPort; port < startPort + maxAttempts; port++) {
        if (await isPortAvailable(port)) {
            return port;
        }
    }
    throw new Error(`No available ports found in range ${startPort}-${startPort + maxAttempts}`);
}

function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false);
            } else {
                resolve(false);
            }
        });

        server.once('listening', () => {
            server.close();
            resolve(true);
        });

        server.listen(port, '127.0.0.1');
    });
}

function generateUniqueId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
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

async function main() {
    const scriptFile = process.argv[2];

    if (!scriptFile) {
        console.error('Usage: node run-headless.js <script-file>');
        console.error('   Example: node run-headless.js debug/cdp-debug-verify-working.ts');
        process.exit(1);
    }

    const scriptPath = path.resolve(scriptFile);
    if (!fs.existsSync(scriptPath)) {
        console.error(`Script file not found: ${scriptPath}`);
        process.exit(1);
    }

    // Initialize log file
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
    log('=== Debug Headless Runner ===');
    log(`Started: ${new Date().toISOString()}`);
    log(`Script file: ${scriptFile}`);
    log(`Log file: ${LOG_FILE}\n`);

    // Brief stdout message
    console.log(`Running headless: ${path.basename(scriptFile)}`);
    console.log(`Log: ${LOG_FILE}\n`);

    // Check if extension is built
    const extDir = path.join(__dirname, '../dist/development/chrome');
    if (!fs.existsSync(extDir)) {
        console.error('Surfingkeys extension not found at:', extDir);
        console.error('   Please build the extension first: npm run esbuild:dev');
        logStream.end();
        process.exit(1);
    }

    // Check/start fixtures server
    let fixturesServerPid = null;
    const fixturesServerRunning = await checkFixturesServer();

    if (fixturesServerRunning) {
        log('Fixtures server already running');
    } else {
        fixturesServerPid = await startFixturesServer();
    }

    // Find available port (randomize start to avoid race conditions in parallel runs)
    log('Finding available port...');
    // Add small random delay to stagger parallel port checks (0-200ms)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
    const randomOffset = Math.floor(Math.random() * 50); // Random offset 0-49
    const port = await findAvailablePort(9400 + randomOffset);
    log(`Found available port: ${port}`);

    // Create unique temporary user data directory
    const uniqueId = generateUniqueId();
    const userDataDir = path.join(os.tmpdir(), `chrome-debug-headless-${uniqueId}`);
    fs.mkdirSync(userDataDir, { recursive: true });

    log(`Launching Chrome in headless mode...`);
    log(`  Port: ${port}`);
    log(`  User data: ${userDataDir}`);
    log(`  Extension: ${extDir}`);

    // Launch Chrome in headless mode
    const chromeArgs = [
        '--headless=new',
        `--user-data-dir=${userDataDir}`,
        `--remote-debugging-port=${port}`,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        `--disable-extensions-except=${extDir}`,
        `--load-extension=${extDir}`,
        '--simulate-outdated-no-au=Tue, 31 Dec 2099 23:59:59 GMT',
        '--password-store=basic',
        '--disable-infobars',
        'about:blank'
    ];

    const chrome = spawn('google-chrome-beta', chromeArgs, {
        stdio: 'ignore',
        detached: true
    });

    chrome.unref();

    log(`Chrome launched (PID: ${chrome.pid})`);

    // Wait for Chrome to be ready
    log('Waiting for Chrome DevTools Protocol to be ready...');
    await waitForCDP(port);
    log(`CDP ready at http://localhost:${port}`);

    // Always use ts-node for debug scripts
    log(`\nRunning debug script...`);
    log(`  Script: ${scriptFile}`);
    log(`  CDP_PORT: ${port}`);
    log(`  Runner: ts-node\n`);

    const scriptProcess = spawn('npx', ['ts-node', scriptPath], {
        env: {
            ...process.env,
            CDP_PORT: port.toString(),
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

    // Kill Chrome
    try {
        process.kill(chrome.pid, 'SIGTERM');
        log(`Killed Chrome (PID: ${chrome.pid})`);
    } catch (err) {
        log(`Chrome process may have already exited: ${err.message}`);
    }

    // Kill fixtures server if we started it
    if (fixturesServerPid) {
        try {
            process.kill(fixturesServerPid, 'SIGTERM');
            log(`Killed fixtures server (PID: ${fixturesServerPid})`);
        } catch (err) {
            log(`Fixtures server process may have already exited: ${err.message}`);
        }
    }

    // Remove temporary user data directory
    try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
        log(`Removed temp directory: ${userDataDir}`);
    } catch (err) {
        log(`Could not remove temp directory: ${err.message}`);
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

async function waitForCDP(port, maxWait = 10000, interval = 500) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
        try {
            const response = await fetch(`http://localhost:${port}/json/version`);
            if (response.ok) {
                return true;
            }
        } catch (err) {
            // CDP not ready yet, continue waiting
        }

        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`CDP not ready after ${maxWait}ms`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
