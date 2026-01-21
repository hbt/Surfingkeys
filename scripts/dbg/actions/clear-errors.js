/**
 * Clear Errors Action
 *
 * Clears all stored extension errors from chrome.storage.local
 * Used by the error collection system.
 *
 * Independent implementation - does not depend on debug/ directory
 */

const WebSocket = require('ws');
const { detectExtension, sendCommand, CDP_PORT } = require('../lib/extension-utils');

// Color utilities
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
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
 * Main action runner
 */
async function run(args) {
    console.log(`${colors.bright}Clear Extension Errors${colors.reset}\n`);

    // Detect extension (with auto-wake if dormant)
    console.log(`${colors.cyan}Detecting extension...${colors.reset}`);
    const logFn = (msg) => console.log(`  ${colors.dim || ''}${msg}${colors.reset}`);
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

            // Get error count before clearing
            console.log(`${colors.cyan}Checking stored errors...${colors.reset}`);
            const errorsBefore = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        chrome.storage.local.get(['${STORAGE_KEY}'], (result) => {
                            const errors = result['${STORAGE_KEY}'] || [];
                            resolve({ count: errors.length });
                        });
                    });
                })()
            `);

            console.log(`  Found ${colors.bright}${errorsBefore.count}${colors.reset} stored error(s)\n`);

            // Clear errors
            console.log(`${colors.cyan}Clearing errors...${colors.reset}`);
            const clearResult = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        chrome.storage.local.set({ '${STORAGE_KEY}': [] }, () => {
                            resolve({ success: true });
                        });
                    });
                })()
            `);

            if (clearResult.success) {
                console.log(`  ${colors.green}✓ Errors cleared from storage${colors.reset}\n`);

                // Clear in-memory errors if available
                const memoryResult = await evaluateCode(ws, `
                    (function() {
                        if (typeof globalThis !== 'undefined' && globalThis._surfingkeysErrors) {
                            globalThis._surfingkeysErrors = [];
                            return { cleared: true };
                        }
                        return { cleared: false, reason: 'Not available in memory' };
                    })()
                `);

                if (memoryResult.cleared) {
                    console.log(`  ${colors.green}✓ In-memory errors cleared${colors.reset}\n`);
                } else {
                    console.log(`  ${colors.yellow}⚠ In-memory errors: ${memoryResult.reason}${colors.reset}\n`);
                }

                console.log(`${colors.green}✅ All errors cleared successfully${colors.reset}\n`);
                ws.close();
                process.exit(0);
            } else {
                console.error(`${colors.red}❌ Failed to clear errors${colors.reset}\n`);
                ws.close();
                process.exit(1);
            }

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
