#!/usr/bin/env ts-node
/**
 * CDP - Apply Dark Theme to Help Menu in Shadow Iframe
 *
 * Properly injects dark theme into the iframe within shadow DOM
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
    yellow: '\x1b[33m',
    magenta: '\x1b[35m'
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
    console.log(`${colors.bright}${colors.cyan}Dark Theme via Shadow DOM Iframe${colors.reset}\n`);

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
            await new Promise(r => setTimeout(r, 1500));

            console.log(`${colors.yellow}3. Opening help menu...${colors.reset}`);
            await sendKey(pageWs, '?');
            await new Promise(r => setTimeout(r, 1000));
            console.log(`   ${colors.green}✓ Help menu opened${colors.reset}\n`);

            console.log(`${colors.yellow}4. Injecting dark theme into iframe...${colors.reset}`);

            const result = await execPage(pageWs, `
                (function() {
                    // Find the shadow root with the iframe
                    const allElements = document.querySelectorAll('*');
                    for (const el of allElements) {
                        if (!el.shadowRoot) continue;

                        const iframe = el.shadowRoot.querySelector('iframe.sk_ui');
                        if (!iframe) continue;

                        // Wait a bit for iframe to be ready
                        return new Promise((resolve) => {
                            const checkIframe = () => {
                                try {
                                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                                    if (!iframeDoc) {
                                        setTimeout(checkIframe, 100);
                                        return;
                                    }

                                    // Found the iframe document - inject dark theme
                                    const themeStyle = iframeDoc.getElementById('sk_theme');
                                    if (themeStyle) {
                                        // Override the theme with dark colors
                                        themeStyle.textContent = \`
                                            .sk_theme {
                                                background: #1e1e1e !important;
                                                color: #d4d4d4 !important;
                                            }
                                            .sk_theme input {
                                                color: #d4d4d4 !important;
                                                background: #2d2d2d !important;
                                            }
                                            .sk_theme .url {
                                                color: #b0b0b0 !important;
                                            }
                                            .sk_theme .annotation {
                                                color: #b0b0b0 !important;
                                            }
                                            .sk_theme kbd {
                                                background: #2d2d2d !important;
                                                color: #e8e8e8 !important;
                                                border: 1px solid #555 !important;
                                            }
                                            .sk_theme .feature_name {
                                                color: #f59e42 !important;
                                            }
                                            .sk_theme a {
                                                color: #4fc3f7 !important;
                                            }
                                        \`;
                                        resolve({ success: true, message: 'Dark theme injected!' });
                                    } else {
                                        resolve({ success: false, message: 'sk_theme element not found' });
                                    }
                                } catch (e) {
                                    setTimeout(checkIframe, 100);
                                }
                            };
                            checkIframe();
                        });
                    }
                    return { success: false, message: 'Shadow root with iframe not found' };
                })()
            `);

            console.log(`   ${result.success ? colors.green + '✓' : colors.yellow + '⚠'} ${result.message}${colors.reset}\n`);

            console.log(`${colors.yellow}5. Taking screenshot...${colors.reset}`);
            await new Promise(r => setTimeout(r, 500));
            const screenshot = await captureScreenshot(pageWs);
            const filepath = '/tmp/surfingkeys-help-dark-final.png';
            fs.writeFileSync(filepath, screenshot, 'base64');
            console.log(`   ${colors.green}✓ Screenshot: ${filepath}${colors.reset}\n`);

            console.log(`${colors.magenta}Browser will stay open. Press Ctrl+C to close.${colors.reset}\n`);

            // Keep open
            await new Promise(() => {});

        } catch (error: any) {
            console.error('❌ Error:', error.message);
            console.error(error.stack);
            bgWs.close();
            process.exit(1);
        }
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
