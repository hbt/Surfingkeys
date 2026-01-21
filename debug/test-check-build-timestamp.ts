#!/usr/bin/env ts-node
/**
 * Test: Check build timestamp from chrome://extensions page
 *
 * Extracts the extension description to verify the build timestamp.
 * Useful for visually confirming reloads actually happened.
 *
 * Usage:
 *   npm run debug:cdp:live debug/test-check-build-timestamp.ts
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

    let tab = targets.find((t: any) =>
        t.type === 'page' && t.url?.includes(`chrome://extensions/?errors=${extensionId}`)
    );

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

async function checkBuildTimestamp(extensionId: string) {
    console.log(`${colors.bright}Check Build Timestamp${colors.reset}\n`);

    const tabWsUrl = await findExtensionsTab(extensionId);

    if (!tabWsUrl) {
        console.error(`${colors.red}❌ chrome://extensions tab not found${colors.reset}\n`);
        process.exit(1);
    }

    const ws = new WebSocket(tabWsUrl);

    ws.on('open', async () => {
        try {
            await sendCommand(ws, 'Runtime.enable');

            const extensionInfo = await evaluateCode(ws, `
                (function() {
                    return new Promise((resolve) => {
                        if (!chrome.developerPrivate || !chrome.developerPrivate.getExtensionInfo) {
                            resolve({ error: 'API not available' });
                            return;
                        }

                        chrome.developerPrivate.getExtensionInfo('${extensionId}', (details) => {
                            const err = chrome.runtime.lastError;
                            if (err) {
                                resolve({ error: err.message });
                            } else {
                                resolve({
                                    name: details.name,
                                    version: details.version,
                                    description: details.description
                                });
                            }
                        });
                    });
                })()
            `);

            ws.close();

            if (extensionInfo.error) {
                console.error(`${colors.red}Error: ${extensionInfo.error}${colors.reset}\n`);
                process.exit(1);
            }

            console.log(`${colors.cyan}Extension Info:${colors.reset}`);
            console.log(`  Name: ${colors.bright}${extensionInfo.name}${colors.reset}`);
            console.log(`  Version: ${colors.bright}${extensionInfo.version}${colors.reset}`);
            console.log(`  Description: ${extensionInfo.description}\n`);

            // Extract timestamp if present
            const timestampMatch = extensionInfo.description.match(/\[Built: ([^\]]+)\]/);
            if (timestampMatch) {
                const timestamp = timestampMatch[1];
                const buildDate = new Date(timestamp);
                const now = new Date();
                const ageSeconds = (now.getTime() - buildDate.getTime()) / 1000;

                console.log(`${colors.green}✓ Build timestamp found!${colors.reset}`);
                console.log(`  Timestamp: ${colors.bright}${timestamp}${colors.reset}`);
                console.log(`  Age: ${colors.yellow}${ageSeconds.toFixed(1)}s ago${colors.reset}\n`);
            } else {
                console.log(`${colors.yellow}⚠ No build timestamp found in description${colors.reset}\n`);
            }

            process.exit(0);

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

    await checkBuildTimestamp(extensionId);
}

main();
