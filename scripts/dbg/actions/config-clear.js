/**
 * Config Clear Action
 *
 * Wipes all config-related keys from chrome.storage.local:
 *   localPath, snippets, showAdvanced, savedAt
 *
 * Resets the extension to a clean state as if freshly installed.
 *
 * Requires: gchrb-dev with CDP on port 9222
 */

const WebSocket = require('ws');
const { detectExtension, sendCommand, CDP_PORT } = require('../lib/extension-utils');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

const CONFIG_KEYS = ['localPath', 'snippets', 'showAdvanced', 'savedAt'];

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

async function run(args) {
    console.log(`${colors.bright}Clear Config Storage${colors.reset}\n`);

    console.log(`${colors.cyan}Detecting extension...${colors.reset}`);
    const logFn = (msg) => console.log(`  ${colors.dim}${msg}${colors.reset}`);
    const extInfo = await detectExtension(logFn);

    if (!extInfo) {
        console.error(`${colors.red}Error: Could not detect Surfingkeys extension${colors.reset}`);
        console.error(`Make sure the extension is installed and the browser is running with CDP on port ${CDP_PORT}\n`);
        process.exit(1);
    }

    console.log(`  Extension ID: ${colors.bright}${extInfo.id}${colors.reset}\n`);

    const ws = new WebSocket(extInfo.wsUrl);

    ws.on('open', async () => {
        try {
            await sendCommand(ws, 'Runtime.enable');
            console.log(`  ${colors.green}✓ Connected${colors.reset}\n`);

            // Read current values before clearing
            console.log(`${colors.cyan}Reading current storage values...${colors.reset}`);

            const keysJson = JSON.stringify(CONFIG_KEYS);
            const before = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        chrome.storage.local.get(${keysJson}, (result) => {
                            resolve({
                                localPath: result.localPath || null,
                                snippetsLength: result.snippets ? result.snippets.length : 0,
                                showAdvanced: result.showAdvanced ?? null,
                                savedAt: result.savedAt ?? null
                            });
                        });
                    });
                })()
            `);

            console.log(`  localPath:      ${colors.bright}${before.localPath ?? '(not set)'}${colors.reset}`);
            console.log(`  snippetsLength: ${colors.bright}${before.snippetsLength}${colors.reset}`);
            console.log(`  showAdvanced:   ${colors.bright}${before.showAdvanced ?? '(not set)'}${colors.reset}`);
            console.log(`  savedAt:        ${colors.bright}${before.savedAt ? new Date(before.savedAt).toISOString() : '(not set)'}${colors.reset}\n`);

            // Clear all config keys
            console.log(`${colors.cyan}Clearing ${CONFIG_KEYS.join(', ')}...${colors.reset}`);

            const clearResult = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        chrome.storage.local.remove(${keysJson}, () => {
                            resolve({ success: true });
                        });
                    });
                })()
            `);

            if (clearResult.success) {
                console.log(`  ${colors.green}✓ Cleared${colors.reset}\n`);
            } else {
                console.log(`  ${colors.red}✗ Failed${colors.reset}\n`);
                ws.close();
                process.exit(1);
            }

            console.log(JSON.stringify({
                success: true,
                cleared: CONFIG_KEYS,
                before
            }, null, 2));

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
