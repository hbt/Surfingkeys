/**
 * Errors List Action
 *
 * Lists all stored extension errors from chrome.storage.local
 * Used by the error collection system.
 *
 * Independent implementation - does not depend on debug/ directory
 */

const WebSocket = require('ws');
const { detectExtension, findServiceWorker, sendCommand, CDP_PORT } = require('./extension-utils');

// Color utilities
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m'
};

const STORAGE_KEY = 'surfingkeys_errors';

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
 * Format error for display
 */
function formatError(err, idx) {
    const lines = [];
    lines.push(`${colors.bright}[${idx + 1}]${colors.reset} ${colors.yellow}${err.type}${colors.reset}`);
    lines.push(`    ${colors.cyan}Message:${colors.reset} ${err.message}`);
    lines.push(`    ${colors.cyan}Context:${colors.reset} ${err.context}`);
    lines.push(`    ${colors.cyan}Time:${colors.reset} ${err.timestamp}`);

    if (err.source) {
        lines.push(`    ${colors.cyan}Location:${colors.reset} ${err.source}:${err.lineno}:${err.colno}`);
    }

    if (err.stack) {
        const stackLines = err.stack.split('\n').slice(0, 3);
        lines.push(`    ${colors.cyan}Stack:${colors.reset}`);
        stackLines.forEach(line => {
            lines.push(`      ${colors.dim}${line.trim()}${colors.reset}`);
        });
    }

    return lines.join('\n');
}

/**
 * Main action runner
 */
async function run(args) {
    console.log(`${colors.bright}List Extension Errors${colors.reset}\n`);

    // Detect extension (with auto-wake if dormant)
    console.log(`${colors.cyan}Detecting extension...${colors.reset}`);
    const logFn = (msg) => console.log(`  ${colors.dim}${msg}${colors.reset}`);
    const extInfo = await detectExtension(logFn);

    if (!extInfo) {
        console.error(`${colors.red}Error: Could not detect Surfingkeys extension${colors.reset}`);
        console.error(`Make sure the extension is installed and the browser is running with CDP on port ${CDP_PORT}\n`);
        process.exit(1);
    }

    const extensionId = extInfo.id;
    const swWsUrl = extInfo.wsUrl;

    console.log(`  Extension ID: ${colors.bright}${extensionId}${colors.reset}\n`);

    // Connect to service worker
    console.log(`${colors.cyan}Connecting to service worker...${colors.reset}`);

    const ws = new WebSocket(swWsUrl);

    ws.on('open', async () => {
        try {
            await sendCommand(ws, 'Runtime.enable');
            console.log(`  ${colors.green}✓ Connected${colors.reset}\n`);

            // Get errors from storage
            console.log(`${colors.cyan}Reading errors from storage...${colors.reset}`);
            const storedErrors = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        chrome.storage.local.get(['${STORAGE_KEY}'], (result) => {
                            resolve(result['${STORAGE_KEY}'] || []);
                        });
                    });
                })()
            `);

            console.log(`  Found ${colors.bright}${storedErrors.length}${colors.reset} stored error(s)\n`);

            if (storedErrors.length === 0) {
                console.log(`${colors.green}✨ No errors found${colors.reset}\n`);
                ws.close();
                process.exit(0);
                return;
            }

            // Display stored errors
            console.log('='.repeat(70));
            console.log(`${colors.bright}STORED ERRORS${colors.reset} (from chrome.storage.local)`);
            console.log('='.repeat(70));
            console.log();

            storedErrors.forEach((err, idx) => {
                console.log(formatError(err, idx));
                console.log();
            });

            // Check for in-memory errors
            console.log('='.repeat(70));
            console.log(`${colors.bright}IN-MEMORY ERRORS${colors.reset}`);
            console.log('='.repeat(70));
            console.log();

            const memoryErrors = await evaluateCode(ws, `
                (function() {
                    if (typeof globalThis !== 'undefined' && globalThis._surfingkeysErrors) {
                        return globalThis._surfingkeysErrors;
                    }
                    return null;
                })()
            `);

            if (memoryErrors && memoryErrors.length > 0) {
                console.log(`  Found ${colors.bright}${memoryErrors.length}${colors.reset} error(s) in memory\n`);
                memoryErrors.forEach((err, idx) => {
                    console.log(formatError(err, idx));
                    console.log();
                });
            } else {
                console.log(`  ${colors.dim}No in-memory errors${colors.reset}\n`);
            }

            // Summary
            console.log('='.repeat(70));
            console.log(`${colors.bright}SUMMARY${colors.reset}`);
            console.log('='.repeat(70));
            console.log(`  Stored errors: ${colors.bright}${storedErrors.length}${colors.reset}`);
            console.log(`  In-memory errors: ${colors.bright}${memoryErrors ? memoryErrors.length : 0}${colors.reset}`);
            console.log();
            console.log(`${colors.dim}To view in browser: chrome-extension://${extensionId}/pages/error-viewer.html${colors.reset}`);
            console.log(`${colors.dim}To clear errors: bin/dbg errors-clear${colors.reset}`);
            console.log();

            ws.close();
            process.exit(0);

        } catch (error) {
            console.error(`${colors.red}Error: ${error.message}${colors.reset}\n`);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (error) => {
        console.error(`${colors.red}WebSocket error: ${error.message}${colors.reset}\n`);
        process.exit(1);
    });
}

module.exports = { run };
