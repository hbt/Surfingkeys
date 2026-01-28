/**
 * Jest Setup for CDP Tests
 *
 * Runs before each test file to configure the test environment.
 * This runs in the test process (not the reporter process), so it can wrap console.
 */

const fs = require('fs');
const path = require('path');

// Extend Jest timeout for all CDP tests
jest.setTimeout(30000);

// Create a per-test console log file
const testLogDir = '/tmp/cdp-test-console-logs';
if (!fs.existsSync(testLogDir)) {
    fs.mkdirSync(testLogDir, { recursive: true });
}

// Generate unique log file for this worker/test run
const workerId = process.env.JEST_WORKER_ID || 'main';
const timestamp = Date.now();
const testLogFile = path.join(testLogDir, `test-console-${workerId}-${timestamp}.jsonl`);

global.__testConsoleLogFile__ = testLogFile;

const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
};

// Wrap console methods to capture all output to file
const captureLog = (type) => (...args) => {
    const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');

    const logEntry = {
        type: type,
        message: message,
        timestamp: Date.now()
    };

    // Write to file (JSONL format, one entry per line)
    try {
        fs.appendFileSync(testLogFile, JSON.stringify(logEntry) + '\n');
    } catch (e) {
        // Silently fail if we can't write
    }

    // Always call original to show output
    originalConsole[type](...args);
};

console.log = captureLog('log');
console.error = captureLog('error');
console.warn = captureLog('warn');
console.info = captureLog('info');
console.debug = captureLog('debug');
