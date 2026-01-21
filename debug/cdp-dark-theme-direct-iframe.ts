#!/usr/bin/env ts-node
/**
 * CDP - Dark Theme by Connecting Directly to Frontend Iframe
 *
 * Connects to the frontend.html iframe target directly via CDP
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

async function findTarget(targetUrl: string): Promise<string | null> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const target = targets.find((t: any) => t.url.includes(targetUrl));
    return target ? target.webSocketDebuggerUrl : null;
}

async function execInTarget(ws: WebSocket, code: string): Promise<any> {
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

async function main() {
    console.log(`${colors.bright}${colors.cyan}Dark Theme via Direct Iframe Connection${colors.reset}\n`);

    console.log(`${colors.yellow}1. Finding frontend.html iframe target...${colors.reset}`);
    const frontendWsUrl = await findTarget('pages/frontend.html');
    if (!frontendWsUrl) {
        console.log(`   ${colors.yellow}⚠ Frontend iframe not found. Is help menu open?${colors.reset}`);
        console.log(`   Waiting 2 seconds and trying again...`);
        await new Promise(r => setTimeout(r, 2000));
        const retryUrl = await findTarget('pages/frontend.html');
        if (!retryUrl) {
            throw new Error('Frontend iframe not found - make sure help menu is open');
        }
    }
    console.log(`   ${colors.green}✓ Frontend iframe found${colors.reset}\n`);

    const frontendWs = new WebSocket(frontendWsUrl!);
    await new Promise(resolve => frontendWs.on('open', resolve));
    frontendWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    frontendWs.send(JSON.stringify({ id: messageId++, method: 'Page.enable' }));
    await new Promise(r => setTimeout(r, 500));

    console.log(`${colors.yellow}2. Inspecting iframe document...${colors.reset}`);
    const docInfo = await execInTarget(frontendWs, `
        ({
            readyState: document.readyState,
            hasSk_usage: !!document.getElementById('sk_usage'),
            hasSk_theme: !!document.getElementById('sk_theme'),
            bodyChildren: document.body ? document.body.children.length : 0
        })
    `);
    console.log(`   Document ready: ${docInfo.readyState}`);
    console.log(`   Has sk_usage: ${docInfo.hasSk_usage}`);
    console.log(`   Has sk_theme: ${docInfo.hasSk_theme}`);
    console.log(`   Body children: ${docInfo.bodyChildren}\n`);

    if (!docInfo.hasSk_theme) {
        console.log(`   ${colors.yellow}⚠ sk_theme element not found - document might not be fully loaded${colors.reset}\n`);
    }

    console.log(`${colors.yellow}3. Injecting dark theme...${colors.reset}`);
    const result = await execInTarget(frontendWs, `
        (function() {
            const themeStyle = document.getElementById('sk_theme');
            if (!themeStyle) {
                return { success: false, message: 'sk_theme element not found' };
            }

            // Inject dark theme CSS
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
                .sk_theme .omnibar_highlight {
                    color: #ff6b6b !important;
                }
            \`;

            return { success: true, message: 'Dark theme applied!' };
        })()
    `);

    console.log(`   ${result.success ? colors.green + '✓' : colors.yellow + '⚠'} ${result.message}${colors.reset}\n`);

    console.log(`${colors.yellow}4. Taking screenshot from main page...${colors.reset}`);
    const pageWsUrl = await findTarget('127.0.0.1:9873/hackernews.html');
    if (pageWsUrl) {
        const pageWs = new WebSocket(pageWsUrl);
        await new Promise(resolve => pageWs.on('open', resolve));
        pageWs.send(JSON.stringify({ id: messageId++, method: 'Page.enable' }));
        await new Promise(r => setTimeout(r, 500));

        const screenshot = await new Promise<string>((resolve, reject) => {
            const id = messageId++;
            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

            const handler = (data: WebSocket.Data) => {
                const msg = JSON.parse(data.toString());
                if (msg.id === id) {
                    clearTimeout(timeout);
                    pageWs.removeListener('message', handler);
                    if (msg.error) {
                        reject(new Error(msg.error.message));
                    } else {
                        resolve(msg.result.data);
                    }
                }
            };

            pageWs.on('message', handler);
            pageWs.send(JSON.stringify({
                id,
                method: 'Page.captureScreenshot',
                params: {
                    format: 'png',
                    captureBeyondViewport: false
                }
            }));
        });

        const filepath = '/tmp/surfingkeys-help-dark-success.png';
        fs.writeFileSync(filepath, screenshot, 'base64');
        console.log(`   ${colors.green}✓ Screenshot: ${filepath}${colors.reset}\n`);
        pageWs.close();
    }

    console.log(`${colors.magenta}Dark theme applied! Browser will stay open.${colors.reset}`);
    console.log(`${colors.magenta}Press Ctrl+C to close.${colors.reset}\n`);

    // Keep open
    await new Promise(() => {});
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
