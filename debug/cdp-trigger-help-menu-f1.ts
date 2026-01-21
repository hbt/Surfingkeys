#!/usr/bin/env ts-node
/**
 * CDP Debug Script - Trigger Help Menu via F1
 *
 * Opens the Surfingkeys help overlay by sending an F1 key event through CDP.
 * Requires the Surfingkeys config to map F1 -> help (e.g. api.mapkey('<F1>', ...)).
 *
 * Usage (live browser):
 *   npm run debug:cdp:live debug/cdp-trigger-help-menu-f1.ts
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
    magenta: '\x1b[35m'
};

async function findBackgroundWebSocket(): Promise<string> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const bg = targets.find((t: any) => t.title === 'Surfingkeys' || t.url.includes('background.js'));
    if (!bg) {
        throw new Error('Surfingkeys background service worker not found');
    }
    return bg.webSocketDebuggerUrl;
}

async function createTestTab(bgWs: WebSocket, url: string): Promise<number> {
    const tab = await new Promise<any>((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout creating tab')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                bgWs.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result?.result?.value);
                }
            }
        };

        bgWs.on('message', handler);
        bgWs.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: `
                    new Promise(r => {
                        chrome.tabs.create({
                            url: '${url}',
                            active: true
                        }, tab => r({ id: tab.id }));
                    })
                `,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
    return tab.id;
}

async function findPageWebSocket(urlSubstring: string): Promise<string> {
    await new Promise(r => setTimeout(r, 1000));
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const page = targets.find((t: any) => t.type === 'page' && t.url.includes(urlSubstring));
    if (!page) {
        throw new Error(`Unable to find page target containing ${urlSubstring}`);
    }
    return page.webSocketDebuggerUrl;
}

async function sendFunctionKey(ws: WebSocket, fKey: string): Promise<void> {
    const fNum = parseInt(fKey.replace('F', ''), 10);
    if (isNaN(fNum) || fNum < 1 || fNum > 12) {
        throw new Error(`Invalid function key: ${fKey}`);
    }
    const windowsVirtualKeyCode = 111 + fNum; // Chrome expects VK codes for function keys

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: fKey,
            code: fKey,
            windowsVirtualKeyCode
        }
    }));
    await new Promise(r => setTimeout(r, 60));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: fKey,
            code: fKey,
            windowsVirtualKeyCode
        }
    }));
    await new Promise(r => setTimeout(r, 120));
}

async function main() {
    console.log(`${colors.bright}${colors.cyan}Triggering Surfingkeys Help via F1${colors.reset}`);

    const bgWs = new WebSocket(await findBackgroundWebSocket());
    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(r => setTimeout(r, 100));

            console.log(`${colors.yellow}1. Creating Hacker News test tab...${colors.reset}`);
            const tabId = await createTestTab(bgWs, 'http://127.0.0.1:9873/hackernews.html');
            console.log(`   ${colors.green}✓ Tab created (ID: ${tabId})${colors.reset}`);

            console.log(`${colors.yellow}2. Finding page target...${colors.reset}`);
            const pageWsUrl = await findPageWebSocket('127.0.0.1:9873/hackernews.html');
            const pageWs = new WebSocket(pageWsUrl);
            await new Promise(resolve => pageWs.on('open', resolve));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
            await new Promise(r => setTimeout(r, 1000));

            console.log(`${colors.yellow}3. Sending F1 key event...${colors.reset}`);
            await sendFunctionKey(pageWs, 'F1');
            console.log(`   ${colors.green}✓ Help overlay should now be visible (via F1 mapping)${colors.reset}`);

            console.log(`${colors.magenta}Leave Chrome open to inspect the help panel. Press Ctrl+C to quit.${colors.reset}`);

            await new Promise(() => {});
        } catch (error: any) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    });

    bgWs.on('error', (error) => {
        console.error('❌ Background error:', error.message);
        process.exit(1);
    });
}

main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});

