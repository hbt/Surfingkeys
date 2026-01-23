#!/usr/bin/env node
/**
 * Headless CDP Test Runner
 *
 * Launches Chrome in headless mode with isolated profile and dynamic port,
 * runs a CDP test, then cleans up.
 *
 * Features:
 * - Dynamic port allocation (finds available port starting from 9300)
 * - Unique temporary user data directory
 * - Automatic Chrome cleanup after test
 * - Port passed to test via CDP_PORT environment variable
 *
 * Usage:
 *   node tests/cdp/run-headless.js tests/cdp/cdp-keyboard.ts
 *   npm run test:cdp:headless tests/cdp/cdp-keyboard.ts
 *   node tests/cdp/run-headless.js --reporter=default tests/cdp/cdp-keyboard.ts
 */

const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Log file setup
const timestamp = new Date().toISOString().split('T')[0];
const uniqueId = Math.random().toString(36).substring(2, 8);
const LOG_FILE = `/tmp/cdp-headless-${timestamp}-${uniqueId}.log`;
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
async function findAvailablePort(startPort = 9300, maxAttempts = 100) {
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

function parseCli(argv) {
    const parsed = {
        reporter: process.env.CDP_HEADLESS_REPORTER || 'json',
        positional: []
    };

    const args = [...argv];
    while (args.length) {
        const arg = args.shift();
        if (arg === '--reporter' || arg === '--reporters') {
            const value = args.shift();
            if (!value) {
                console.error('❌ Missing value for --reporter');
                process.exit(1);
            }
            parsed.reporter = value;
        } else if (arg.startsWith('--reporter=')) {
            parsed.reporter = arg.split('=')[1];
        } else if (arg.startsWith('--reporters=')) {
            parsed.reporter = arg.split('=')[1];
        } else {
            parsed.positional.push(arg);
        }
    }

    return parsed;
}

function normalizeReporter(value) {
    if (!value) {
        return 'streaming';
    }
    const normalized = value.toString().toLowerCase();
    if (normalized === 'default' || normalized === 'verbose' || normalized === 'jest') {
        return 'default';
    }
    if (normalized === 'table') {
        return 'table';
    }
    if (normalized === 'both' || normalized === 'all') {
        return 'both';
    }
    if (normalized === 'json') {
        return 'json';
    }
    if (normalized === 'none' || normalized === 'quiet') {
        return 'none';
    }
    return 'streaming';
}

function buildReporterArgs(mode, streamingReporterPath) {
    const jsonReporterPath = path.join(__dirname, '../reporters/json-reporter.js');
    const tableReporterPath = path.join(__dirname, '../reporters/table-reporter-jest.js');

    switch (mode) {
    case 'default':
        return {
            label: 'jest-default',
            args: ['--reporters', 'default']
        };
    case 'table':
        return {
            label: 'json+table',
            args: ['--reporters', jsonReporterPath, '--reporters', tableReporterPath]
        };
    case 'both':
        return {
            label: 'streaming+default',
            args: ['--reporters', streamingReporterPath, '--reporters', 'default']
        };
    case 'json':
        return {
            label: 'json',
            args: ['--reporters', jsonReporterPath]
        };
    case 'none':
        return {
            label: 'jest-default (implicit)',
            args: []
        };
    case 'streaming':
    default:
        return {
            label: 'streaming',
            args: ['--reporters', streamingReporterPath]
        };
    }
}

async function main() {
    const cli = parseCli(process.argv.slice(2));
    const testFile = cli.positional[0];

    if (!testFile) {
        console.error('❌ Usage: node run-headless.js [--reporter=<json|table|streaming|default|both>] <test-file>');
        console.error('');
        console.error('   Note: Use `bin/dbg test-run <test-file>` for the recommended testing approach');
        console.error('');
        console.error('   Reporters:');
        console.error('   - json (default):   Concise JSON summary + full report to file');
        console.error('   - table:            Markdown tables from JSON report');
        console.error('   - streaming:        Real-time progress output');
        console.error('   - default:          Jest default reporter');
        console.error('   - both:             Streaming + default');
        console.error('');
        console.error('   Examples:');
        console.error('   - bin/dbg test-run tests/cdp/commands/cdp-create-hints.test.ts');
        console.error('   - npm run test:cdp:headless -- --reporter=table tests/cdp/commands/cdp-create-hints.test.ts');
        console.error('   - npm run test:cdp:headless -- --reporter=streaming tests/cdp/commands/cdp-create-hints.test.ts');
        process.exit(1);
    }

    const testPath = path.resolve(testFile);
    if (!fs.existsSync(testPath)) {
        console.error(`❌ Test file not found: ${testPath}`);
        process.exit(1);
    }

    // Initialize log file
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
    log('=== CDP Headless Test Runner ===');
    log(`Started: ${new Date().toISOString()}`);
    log(`Test file: ${testFile}`);
    log(`Log file: ${LOG_FILE}\n`);

    // Brief stdout message
    console.log(`Running headless: ${path.basename(testFile)}`);
    console.log(`Log: ${LOG_FILE}\n`);

    // Check if extension is built
    const extDir = path.join(__dirname, '../../dist/development/chrome');
    if (!fs.existsSync(extDir)) {
        console.error('❌ Surfingkeys extension not found at:', extDir);
        console.error('   Please build the extension first: npm run build:dev');
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
    const port = await findAvailablePort(9300 + randomOffset);
    log(`Found available port: ${port}`);

    // Create unique temporary user data directory
    const uniqueId = generateUniqueId();
    const userDataDir = path.join(os.tmpdir(), `chrome-headless-test-${uniqueId}`);
    fs.mkdirSync(userDataDir, { recursive: true });

    // Pre-create Default profile preferences so developer mode is enabled automatically.
    const defaultProfileDir = path.join(userDataDir, 'Default');
    fs.mkdirSync(defaultProfileDir, { recursive: true });
    const preferencesPath = path.join(defaultProfileDir, 'Preferences');
    if (!fs.existsSync(preferencesPath)) {
        const prefPayload = {
            extensions: {
                ui: {
                    developer_mode: true
                }
            }
        };
        fs.writeFileSync(preferencesPath, JSON.stringify(prefPayload, null, 2));
        log('Initialized Chrome preferences (developer mode enabled)');
    }

    log(`Launching Chrome in headless mode...`);
    log(`  Port: ${port}`);
    log(`  User data: ${userDataDir}`);
    log(`  Extension: ${extDir}`);

    // Launch Chrome in headless mode
    // // TODO(hbt) NEXT [debug] fix both tests and debug to use same flags -- get rid of dup config?
    const chromeArgs = [
        '--headless=new',
        `--user-data-dir=${userDataDir}`,
        `--remote-debugging-port=${port}`,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // Telemetry and background networking
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-domain-reliability',
        '--disable-component-update',
        '--disable-sync',
        '--no-pings',
        '--metrics-recording-only',
        '--disable-features=MediaRouter',
        '--disable-features=OptimizationHints',
        '--disable-features=AutofillServerCommunication',
        '--disable-features=CertificateTransparencyComponentUpdater',
        `--disable-extensions-except=${extDir}`,
        `--load-extension=${extDir}`,
        '--enable-experimental-extension-apis',
        '--enable-features=UserScriptsAPI',
        '--simulate-outdated-no-au=Tue, 31 Dec 2099 23:59:59 GMT',
        '--password-store=basic',
        '--disable-infobars',
        'about:blank'
    ];

    // Use CHROME env var if set (by browser-actions/setup-chrome), otherwise fall back to google-chrome-beta
    const chromeBinary = process.env.CHROME || 'google-chrome-beta';

    const chrome = spawn(chromeBinary, chromeArgs, {
        stdio: 'ignore',
        detached: true
    });

    chrome.unref();

    log(`Chrome launched (PID: ${chrome.pid})`);

    // Wait for Chrome to be ready
    log('Waiting for Chrome DevTools Protocol to be ready...');
    await waitForCDP(port);
    log(`CDP ready at http://localhost:${port}`);

    // Detect if this is a Jest test file or standalone script
    const isJestTest = testPath.endsWith('.test.ts');
    const command = isJestTest ? 'jest' : 'ts-node';
    const streamingReporter = path.join(__dirname, 'streaming-reporter.js');
    const reporterMode = normalizeReporter(cli.reporter);
    if (cli.reporter && reporterMode === 'streaming' && cli.reporter.toLowerCase() !== 'streaming') {
        log(`Reporter "${cli.reporter}" not recognized. Falling back to streaming reporter.`);
    }
    const reporterConfig = buildReporterArgs(reporterMode, streamingReporter);
    const args = isJestTest
        ? ['--config=config/jest.config.cdp.js', ...reporterConfig.args, '--', testPath]
        : [testPath];

    log(`\nRunning test...`);
    log(`  Test: ${testFile}`);
    log(`  CDP_PORT: ${port}`);
    log(`  Runner: ${command}`);
    if (isJestTest) {
        log(`  Reporter: ${reporterConfig.label}`);
    }
    log('');

    const testProcess = spawn('npx', [command, ...args], {
        env: {
            ...process.env,
            CDP_PORT: port.toString(),
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
    if (testExitCode === 0) {
        console.log(`✅ Tests passed\n`);
    } else {
        console.log(`❌ Tests failed (exit code: ${testExitCode})\n`);
    }

    // Exit with same code as test
    process.exit(testExitCode || 0);
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
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
