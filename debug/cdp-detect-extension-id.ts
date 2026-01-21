#!/usr/bin/env ts-node
/**
 * Auto-detect Surfingkeys extension ID via CDP
 *
 * Strategies:
 * 1. Look for service worker with "Surfingkeys" title
 * 2. Look for chrome-extension:// URLs in open tabs
 * 3. Query chrome.management.getAll() from chrome://extensions page
 */

import * as http from 'http';
import * as WebSocket from 'ws';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    red: '\x1b[31m'
};

interface ExtensionInfo {
    id: string;
    name: string;
    method: string;
}

async function fetchJson(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        http.get({ host: CDP_CONFIG.host, port: CDP_CONFIG.port, path }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(err);
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

async function detectViaServiceWorker(): Promise<ExtensionInfo | null> {
    const targets = await fetchJson('/json');

    // Look for Surfingkeys service worker
    const sw = targets.find((t: any) =>
        t.type === 'service_worker' &&
        (t.title === 'Surfingkeys' || t.url?.includes('surfingkeys'))
    );

    if (sw && sw.url) {
        const match = sw.url.match(/chrome-extension:\/\/([a-z]+)/);
        if (match) {
            return {
                id: match[1],
                name: sw.title || 'Unknown',
                method: 'service_worker'
            };
        }
    }

    return null;
}

async function detectViaExtensionURLs(): Promise<ExtensionInfo | null> {
    const targets = await fetchJson('/json');

    // Look for any chrome-extension:// URLs
    const extTargets = targets.filter((t: any) =>
        t.url && t.url.startsWith('chrome-extension://')
    );

    for (const target of extTargets) {
        const match = target.url.match(/chrome-extension:\/\/([a-z]+)/);
        if (match) {
            return {
                id: match[1],
                name: 'Unknown (from URL)',
                method: 'extension_url'
            };
        }
    }

    return null;
}

async function detectViaManagementAPI(): Promise<ExtensionInfo | null> {
    const targets = await fetchJson('/json');

    // Find chrome://extensions page
    const extPage = targets.find((t: any) =>
        t.type === 'page' && t.url && t.url.startsWith('chrome://extensions')
    );

    if (!extPage || !extPage.webSocketDebuggerUrl) {
        return null;
    }

    const ws = new WebSocket(extPage.webSocketDebuggerUrl);

    return new Promise((resolve, reject) => {
        ws.on('open', async () => {
            try {
                await sendCommand(ws, 'Runtime.enable');

                const result = await evaluateCode(ws, `
                    (async function() {
                        return new Promise((resolve) => {
                            chrome.management.getAll((extensions) => {
                                const surfingkeys = extensions.find(ext =>
                                    ext.name.toLowerCase().includes('surfingkeys') ||
                                    ext.shortName?.toLowerCase().includes('surfingkeys')
                                );

                                if (surfingkeys) {
                                    resolve({
                                        id: surfingkeys.id,
                                        name: surfingkeys.name,
                                        version: surfingkeys.version,
                                        enabled: surfingkeys.enabled
                                    });
                                } else {
                                    resolve(null);
                                }
                            });
                        });
                    })()
                `);

                ws.close();

                if (result) {
                    resolve({
                        id: result.id,
                        name: result.name,
                        method: 'chrome.management.getAll()'
                    });
                } else {
                    resolve(null);
                }

            } catch (error) {
                ws.close();
                reject(error);
            }
        });

        ws.on('error', (error) => {
            reject(error);
        });
    });
}

async function main() {
    console.log(`${colors.bright}Auto-detecting Surfingkeys Extension ID${colors.reset}\n`);

    const methods: Array<{name: string, fn: () => Promise<ExtensionInfo | null>}> = [
        { name: 'Service Worker Detection', fn: detectViaServiceWorker },
        { name: 'Extension URL Detection', fn: detectViaExtensionURLs },
        { name: 'chrome.management API', fn: detectViaManagementAPI }
    ];

    const results: ExtensionInfo[] = [];

    for (const method of methods) {
        console.log(`${colors.yellow}Trying: ${method.name}${colors.reset}`);
        try {
            const result = await method.fn();
            if (result) {
                console.log(`   ${colors.green}✓ Found: ${result.id} (${result.name})${colors.reset}\n`);
                results.push(result);
            } else {
                console.log(`   ${colors.red}✗ Not found${colors.reset}\n`);
            }
        } catch (error: any) {
            console.log(`   ${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
        }
    }

    console.log(`${colors.bright}Summary:${colors.reset}\n`);

    if (results.length === 0) {
        console.log(`${colors.red}❌ Could not detect extension ID${colors.reset}`);
        console.log(`\nTroubleshooting:`);
        console.log(`  1. Make sure Surfingkeys extension is loaded in Chrome`);
        console.log(`  2. Open chrome://extensions to activate the service worker`);
        console.log(`  3. Try navigating to a page with the extension active\n`);
        process.exit(1);
    }

    // Check if all methods agree
    const uniqueIds = [...new Set(results.map(r => r.id))];

    if (uniqueIds.length === 1) {
        const extensionId = uniqueIds[0];
        const info = results[0];
        console.log(`${colors.green}✅ Extension ID detected: ${colors.bright}${extensionId}${colors.reset}\n`);
        console.log(`Name:    ${info.name}`);
        console.log(`Methods: ${results.map(r => r.method).join(', ')}`);
        console.log(`\nTo use in scripts:`);
        console.log(`  ${colors.cyan}EXTENSION_ID=${extensionId} npx ts-node script.ts${colors.reset}`);
        console.log(`  ${colors.cyan}export EXTENSION_ID=${extensionId}${colors.reset}\n`);

        // Also output just the ID for easy piping
        console.log(`${colors.magenta}Extension ID only:${colors.reset}`);
        console.log(extensionId);

        process.exit(0);
    } else {
        console.log(`${colors.yellow}⚠️  Multiple IDs detected (conflict):${colors.reset}`);
        results.forEach(r => {
            console.log(`  - ${r.id} via ${r.method} (${r.name})`);
        });
        console.log();
        console.log(`Using first detected: ${colors.bright}${results[0].id}${colors.reset}\n`);
        console.log(results[0].id);
        process.exit(0);
    }
}

main().catch(error => {
    console.error(`${colors.red}❌ Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
});
