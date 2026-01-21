#!/usr/bin/env ts-node
/**
 * Test: Extract errors from chrome://extensions page using CDP
 *
 * Tests understanding of how to extract extension errors when
 * the extension has failed to load or has runtime errors.
 *
 * Requires: chrome://extensions/?errors=<extensionId> tab to be open
 *
 * Usage:
 *   npm run debug:cdp:live debug/test-error-extraction.ts
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

async function fetchJson(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}${path}`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error: any) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
        }).on('error', reject);
    });
}

function sendCommand(ws: WebSocket, method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result);
                }
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluateCode(ws: WebSocket, expression: string): Promise<any> {
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

async function findExtensionsTab(extensionId: string): Promise<string | null> {
    const targets = await fetchJson('/json');

    // Try exact match first
    let tab = targets.find((t: any) =>
        t.type === 'page' && t.url?.includes(`chrome://extensions/?errors=${extensionId}`)
    );

    // Fall back to any chrome://extensions page
    if (!tab) {
        tab = targets.find((t: any) =>
            t.type === 'page' && t.url?.startsWith('chrome://extensions')
        );
    }

    return tab ? tab.webSocketDebuggerUrl : null;
}

async function detectExtensionId(): Promise<string | null> {
    const targets = await fetchJson('/json');

    const sw = targets.find((t: any) =>
        t.type === 'service_worker' &&
        t.url?.includes('background.js')
    );

    if (sw && sw.url) {
        const match = sw.url.match(/chrome-extension:\/\/([a-z]+)/);
        if (match) {
            return match[1];
        }
    }

    return null;
}

async function extractErrors(extensionId: string) {
    console.log(`${colors.bright}Extract Extension Errors Test${colors.reset}\n`);

    // Find chrome://extensions tab
    console.log(`${colors.cyan}Finding chrome://extensions tab...${colors.reset}`);
    const tabWsUrl = await findExtensionsTab(extensionId);

    if (!tabWsUrl) {
        console.error(`${colors.red}❌ chrome://extensions tab not found${colors.reset}`);
        console.error(`Please open: ${colors.cyan}chrome://extensions/?errors=${extensionId}${colors.reset}\n`);
        process.exit(1);
    }

    console.log(`${colors.green}✓ Found tab${colors.reset}\n`);

    // Connect to tab
    const ws = new WebSocket(tabWsUrl);

    ws.on('open', async () => {
        try {
            await sendCommand(ws, 'Runtime.enable');
            console.log(`${colors.cyan}Extracting extension info...${colors.reset}\n`);

            // Call chrome.developerPrivate.getExtensionInfo()
            const extensionInfo = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        if (!chrome.developerPrivate || !chrome.developerPrivate.getExtensionInfo) {
                            resolve({
                                error: 'chrome.developerPrivate.getExtensionInfo not available'
                            });
                            return;
                        }

                        chrome.developerPrivate.getExtensionInfo('${extensionId}', (details) => {
                            const err = chrome.runtime.lastError;
                            if (err) {
                                resolve({ error: err.message });
                            } else {
                                resolve({
                                    id: details.id,
                                    name: details.name,
                                    version: details.version,
                                    enabled: details.enabled,
                                    manifestErrors: details.manifestErrors || [],
                                    runtimeErrors: details.runtimeErrors || []
                                });
                            }
                        });
                    });
                })()
            `);

            if (extensionInfo.error) {
                console.error(`${colors.red}❌ Error: ${extensionInfo.error}${colors.reset}\n`);
                ws.close();
                process.exit(1);
            }

            // Display results
            console.log(`${colors.bright}Extension Info:${colors.reset}`);
            console.log(`  Name: ${extensionInfo.name}`);
            console.log(`  Version: ${extensionInfo.version}`);
            console.log(`  ID: ${extensionInfo.id}`);
            console.log(`  Enabled: ${extensionInfo.enabled}\n`);

            const manifestErrors = extensionInfo.manifestErrors || [];
            const runtimeErrors = extensionInfo.runtimeErrors || [];

            console.log(`${colors.bright}Manifest Errors: ${manifestErrors.length}${colors.reset}`);
            if (manifestErrors.length > 0) {
                manifestErrors.forEach((err: any, idx: number) => {
                    console.log(`${colors.red}  [${idx + 1}] ${err.message}${colors.reset}`);
                    console.log(`      Source: ${err.source}`);
                    if (err.stackTrace) {
                        console.log(`      Stack: ${JSON.stringify(err.stackTrace, null, 2)}`);
                    }
                });
            }
            console.log();

            console.log(`${colors.bright}Runtime Errors: ${runtimeErrors.length}${colors.reset}`);
            if (runtimeErrors.length > 0) {
                runtimeErrors.forEach((err: any, idx: number) => {
                    console.log(`${colors.red}  [${idx + 1}] ${err.message}${colors.reset}`);
                    console.log(`      Source: ${err.source}`);
                    console.log(`      Severity: ${err.severity}`);
                    console.log(`      Service Worker: ${err.isServiceWorker}`);
                    if (err.stackTrace) {
                        console.log(`      Stack:`);
                        err.stackTrace.forEach((frame: any) => {
                            console.log(`        at ${frame.functionName || '(anonymous)'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`);
                        });
                    }
                });
            }
            console.log();

            // JSON output
            console.log(`${colors.bright}JSON Output:${colors.reset}`);
            console.log(JSON.stringify({
                extensionId: extensionInfo.id,
                name: extensionInfo.name,
                version: extensionInfo.version,
                enabled: extensionInfo.enabled,
                manifestErrorCount: manifestErrors.length,
                runtimeErrorCount: runtimeErrors.length,
                manifestErrors: manifestErrors,
                runtimeErrors: runtimeErrors,
                hasErrors: manifestErrors.length > 0 || runtimeErrors.length > 0
            }, null, 2));

            ws.close();
            process.exit(runtimeErrors.length > 0 || manifestErrors.length > 0 ? 1 : 0);

        } catch (error: any) {
            console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}\n`);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (error) => {
        console.error(`${colors.red}❌ WebSocket error: ${error.message}${colors.reset}\n`);
        process.exit(1);
    });
}

async function main() {
    const extensionId = await detectExtensionId();

    if (!extensionId) {
        console.error(`${colors.red}❌ Could not detect extension ID${colors.reset}\n`);
        process.exit(1);
    }

    console.log(`Extension ID: ${colors.bright}${extensionId}${colors.reset}\n`);

    await extractErrors(extensionId);
}

main();
