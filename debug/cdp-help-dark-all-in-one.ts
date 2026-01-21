#!/usr/bin/env ts-node
/**
 * CDP All-in-One: Open Help Menu + Apply Dark Theme + Screenshot
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m'
};

async function findBg(): Promise<string> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const bg = targets.find((t: any) => t.title === 'Surfingkeys' || t.url.includes('background.js'));
    if (!bg) throw new Error('Background not found');
    return bg.webSocketDebuggerUrl;
}

async function createTab(bgWs: WebSocket, url: string): Promise<number> {
    const tab = await new Promise<any>((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

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

async function findPage(url: string): Promise<string | null> {
    await new Promise(r => setTimeout(r, 1000));
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const page = targets.find((t: any) =>
        t.type === 'page' && t.url.includes(url)
    );
    return page ? page.webSocketDebuggerUrl : null;
}

async function execPage(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
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

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'rawKeyDown', key }
    }));
    await new Promise(r => setTimeout(r, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'char', text: key }
    }));
    await new Promise(r => setTimeout(r, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'keyUp', key }
    }));
    await new Promise(r => setTimeout(r, 200));
}

async function captureScreenshot(ws: WebSocket): Promise<string> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result.data);
                }
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({
            id,
            method: 'Page.captureScreenshot',
            params: {
                format: 'png',
                captureBeyondViewport: false
            }
        }));
    });
}

async function main() {
    console.log(`${colors.bright}${colors.cyan}Help Menu + Dark Theme (All-in-One)${colors.reset}\n`);

    const bgWs = new WebSocket(await findBg());

    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(r => setTimeout(r, 100));

            console.log(`${colors.yellow}1. Creating tab...${colors.reset}`);
            await createTab(bgWs, 'http://127.0.0.1:9873/hackernews.html');
            console.log(`   ${colors.green}✓ Tab created${colors.reset}\n`);

            console.log(`${colors.yellow}2. Finding page...${colors.reset}`);
            const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
            if (!pageWsUrl) throw new Error('Could not find page');
            console.log(`   ${colors.green}✓ Page found${colors.reset}\n`);

            const pageWs = new WebSocket(pageWsUrl);
            await new Promise(resolve => pageWs.on('open', resolve));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Page.enable' }));
            await new Promise(r => setTimeout(r, 1000));

            console.log(`${colors.yellow}3. Opening help menu...${colors.reset}`);
            await sendKey(pageWs, '?');
            await new Promise(r => setTimeout(r, 500));
            console.log(`   ${colors.green}✓ Help menu opened${colors.reset}\n`);

            console.log(`${colors.yellow}4. Applying dark theme...${colors.reset}`);
            await execPage(pageWs, `
                (function() {
                    const style = document.createElement('style');
                    style.id = 'sk-dark-final';
                    style.textContent = \`
                        #sk_usage {
                            background-color: #1e1e1e !important;
                            color: #d4d4d4 !important;
                        }
                        #sk_usage > div {
                            background-color: #1e1e1e !important;
                        }
                        #sk_usage .feature_name,
                        #sk_usage .feature_name > span {
                            color: #f59e42 !important;
                        }
                        #sk_usage kbd,
                        #sk_usage .kbd-span {
                            background-color: #2d2d2d !important;
                            color: #e8e8e8 !important;
                            border: 1px solid #555 !important;
                        }
                        #sk_usage * {
                            color: #d4d4d4 !important;
                        }
                        #sk_usage a {
                            color: #4fc3f7 !important;
                        }
                    \`;
                    document.head.appendChild(style);
                })()
            `);
            console.log(`   ${colors.green}✓ Dark theme applied${colors.reset}\n`);

            console.log(`${colors.yellow}5. Taking screenshot...${colors.reset}`);
            const screenshot = await captureScreenshot(pageWs);
            const filepath = '/tmp/surfingkeys-help-dark.png';
            fs.writeFileSync(filepath, screenshot, 'base64');
            console.log(`   ${colors.green}✓ Screenshot: ${filepath}${colors.reset}\n`);

            console.log('Browser will stay open. Press Ctrl+C to close.\n');

            // Keep open
            await new Promise(() => {});

        } catch (error: any) {
            console.error('❌ Error:', error.message);
            bgWs.close();
            process.exit(1);
        }
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
