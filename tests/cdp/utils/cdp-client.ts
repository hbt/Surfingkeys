/**
 * CDP Client Utilities
 *
 * Helper functions for connecting to Chrome DevTools Protocol
 * and executing commands.
 */

import WebSocket from 'ws';
import * as http from 'http';
import { CDP_PORT, getCDPJsonUrl } from '../cdp-config';

export interface CDPTarget {
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
}

let globalMessageId = 1;

/**
 * Check if CDP is available on the configured port
 */
export async function checkCDPAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(getCDPJsonUrl(), (res) => {
            res.resume(); // Consume response data to free up socket
            req.destroy(); // Explicitly destroy the request
            resolve(res.statusCode === 200);
        });
        req.on('error', () => {
            req.destroy();
            resolve(false);
        });
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

/**
 * Find the Surfingkeys extension background worker
 */
export async function findExtensionBackground(): Promise<{ wsUrl: string; extensionId: string }> {
    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get(getCDPJsonUrl(), (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });

    const targets: CDPTarget[] = JSON.parse(data);

    const bg = targets.find(t =>
        t.title === 'Surfingkeys' ||
        t.url.includes('_generated_background_page.html') ||
        (t.type === 'service_worker' && t.url.includes('background.js'))
    );

    if (!bg) {
        throw new Error('Surfingkeys background page not found. Available targets: ' +
            JSON.stringify(targets.map(t => ({ title: t.title, type: t.type, url: t.url }))));
    }

    const extensionIdMatch = bg.url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (!extensionIdMatch) {
        throw new Error('Could not extract extension ID from URL: ' + bg.url);
    }

    return {
        wsUrl: bg.webSocketDebuggerUrl,
        extensionId: extensionIdMatch[1]
    };
}

/**
 * Find a content page by URL pattern
 */
export async function findContentPage(urlPattern: string, waitMs: number = 2000): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, waitMs));

    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get(getCDPJsonUrl(), (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });

    const targets: CDPTarget[] = JSON.parse(data);

    const page = targets.find(t =>
        t.type === 'page' && t.url.includes(urlPattern)
    );

    if (!page) {
        throw new Error(`Content page not found. Looking for URL containing: ${urlPattern}. ` +
            `Available pages: ${targets.filter(t => t.type === 'page').map(t => t.url).join(', ')}`);
    }

    return page.webSocketDebuggerUrl;
}

/**
 * Execute code in a CDP target (background or page)
 */
export function executeInTarget(ws: WebSocket, code: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = globalMessageId++;
        const timeoutHandle = setTimeout(() => {
            reject(new Error(`Timeout waiting for response (${timeout}ms)`));
        }, timeout);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeoutHandle);
                ws.removeListener('message', handler);

                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result?.result?.value);
                }
            }
        };

        ws.on('message', handler);

        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: code,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
}

/**
 * Connect to a WebSocket URL and enable Runtime domain
 */
export async function connectToCDP(wsUrl: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            // Enable Runtime domain
            ws.send(JSON.stringify({
                id: globalMessageId++,
                method: 'Runtime.enable'
            }));

            resolve(ws);
        });

        ws.on('error', (error: Error) => {
            reject(error);
        });
    });
}

/**
 * Create a tab using Chrome tabs API via background page
 */
export async function createTab(bgWs: WebSocket, url: string, active: boolean = true): Promise<number> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.create({
                url: '${url}',
                active: ${active}
            }, (tab) => {
                resolve({
                    id: tab.id,
                    url: tab.url
                });
            });
        })
    `);

    return result.id;
}

/**
 * Close a tab
 */
export async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.remove(${tabId}, () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Close a WebSocket connection gracefully
 */
export async function closeCDP(ws: WebSocket): Promise<void> {
    return new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) {
            resolve();
            return;
        }

        ws.on('close', () => resolve());
        ws.close();
    });
}
