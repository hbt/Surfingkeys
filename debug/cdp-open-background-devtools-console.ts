#!/usr/bin/env ts-node
/**
 * Open background page DevTools console via CDP
 *
 * Uses chrome.developerPrivate.openDevTools() to programmatically
 * open the service worker inspector/console.
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

async function findExtensionsTab(extensionId: string): Promise<string | null> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);

    // Try exact match first
    let tab = targets.find((t: any) =>
        t.type === 'page' && t.url && t.url.includes(`chrome://extensions/?errors=${extensionId}`)
    );

    // Fall back to any chrome://extensions page
    if (!tab) {
        tab = targets.find((t: any) =>
            t.type === 'page' && t.url && t.url.startsWith('chrome://extensions')
        );
    }

    return tab ? tab.webSocketDebuggerUrl : null;
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

async function main() {
    const extensionId = process.env.EXTENSION_ID || 'aajlcoiaogpknhgninhopncaldipjdnp';

    console.log(`${colors.bright}Opening Background DevTools Console${colors.reset}\n`);

    const tabWsUrl = await findExtensionsTab(extensionId);
    if (!tabWsUrl) {
        console.error(`${colors.red}❌ chrome://extensions tab not found${colors.reset}`);
        console.error(`Please open: chrome://extensions/?errors=${extensionId}`);
        console.error(`Or: chrome://extensions`);
        process.exit(1);
    }

    const ws = new WebSocket(tabWsUrl);

    ws.on('open', async () => {
        try {
            await sendCommand(ws, 'Runtime.enable');
            console.log(`${colors.green}✓ Connected to chrome://extensions tab${colors.reset}\n`);

            // Open background DevTools
            console.log(`${colors.yellow}Opening background page DevTools...${colors.reset}\n`);

            const result = await evaluateCode(ws, `
                (async function() {
                    const extensionId = '${extensionId}';

                    return new Promise((resolve) => {
                        if (!chrome.developerPrivate || !chrome.developerPrivate.openDevTools) {
                            resolve({
                                success: false,
                                error: 'chrome.developerPrivate.openDevTools not available',
                                hint: 'Must run from chrome://extensions page context'
                            });
                            return;
                        }

                        chrome.developerPrivate.openDevTools({
                            extensionId: extensionId,
                            renderProcessId: -1,
                            renderViewId: -1,
                            isServiceWorker: true,
                            incognito: false
                        }, () => {
                            const err = chrome.runtime.lastError;
                            if (err) {
                                resolve({
                                    success: false,
                                    error: err.message
                                });
                            } else {
                                resolve({
                                    success: true,
                                    message: 'DevTools opened successfully'
                                });
                            }
                        });
                    });
                })()
            `);

            if (result.success) {
                console.log(`${colors.green}✅ SUCCESS - Background DevTools console opened!${colors.reset}\n`);
                console.log(`${colors.cyan}Look for the new DevTools window that appeared.${colors.reset}`);
                console.log(`${colors.cyan}It should show the service worker console.${colors.reset}\n`);
            } else {
                console.log(`${colors.red}❌ FAILED - Could not open DevTools${colors.reset}\n`);
                console.log(`Error: ${result.error}`);
                if (result.hint) {
                    console.log(`Hint: ${result.hint}`);
                }
                console.log();
            }

            ws.close();
            process.exit(result.success ? 0 : 1);

        } catch (error: any) {
            console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (error) => {
        console.error(`${colors.red}❌ WebSocket error: ${error.message}${colors.reset}`);
        process.exit(1);
    });
}

main();
