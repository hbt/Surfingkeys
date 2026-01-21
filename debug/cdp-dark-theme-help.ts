#!/usr/bin/env ts-node
/**
 * CDP Live Injection - Dark Theme for Help Menu
 *
 * Injects dark theme CSS for the Surfingkeys help menu in real-time.
 *
 * Usage:
 * npm run debug:cdp:live debug/cdp-dark-theme-help.ts
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

async function findPage(url: string): Promise<string | null> {
    await new Promise(r => setTimeout(r, 500));
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

async function main() {
    console.log(`${colors.bright}${colors.cyan}Injecting Dark Theme for Help Menu${colors.reset}\n`);

    console.log(`${colors.yellow}1. Finding page...${colors.reset}`);
    const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
    if (!pageWsUrl) throw new Error('Could not find page');
    console.log(`   ${colors.green}✓ Page found${colors.reset}\n`);

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise(resolve => pageWs.on('open', resolve));
    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 100));

    console.log(`${colors.yellow}2. Injecting dark theme CSS...${colors.reset}`);

    await execPage(pageWs, `
        (function() {
            // Remove existing dark theme style if present
            const existingStyle = document.getElementById('sk-dark-theme-override');
            if (existingStyle) {
                existingStyle.remove();
            }

            // Create and inject dark theme styles
            const style = document.createElement('style');
            style.id = 'sk-dark-theme-override';
            style.textContent = \`
                /* Dark theme for help menu */
                #sk_usage {
                    background-color: #1e1e1e !important;
                    color: #d4d4d4 !important;
                }

                #sk_usage > div {
                    background-color: #1e1e1e !important;
                }

                /* Section headers */
                #sk_usage .feature_name {
                    color: #f59e42 !important;
                    background-color: transparent !important;
                }

                #sk_usage .feature_name > span {
                    color: #f59e42 !important;
                }

                /* Key badges */
                #sk_usage kbd,
                #sk_usage .kbd-span {
                    background-color: #3c3c3c !important;
                    color: #e8e8e8 !important;
                    border: 1px solid #555 !important;
                }

                /* Text content */
                #sk_usage span.annotation {
                    color: #d4d4d4 !important;
                }

                #sk_usage * {
                    color: #d4d4d4 !important;
                }

                /* Links */
                #sk_usage a {
                    color: #4fc3f7 !important;
                }

                #sk_usage a:hover {
                    color: #81d4fa !important;
                }

                /* Scrollbar */
                #sk_usage::-webkit-scrollbar {
                    width: 12px;
                    background-color: #2d2d2d;
                }

                #sk_usage::-webkit-scrollbar-thumb {
                    background-color: #555;
                    border-radius: 6px;
                }

                #sk_usage::-webkit-scrollbar-thumb:hover {
                    background-color: #666;
                }
            \`;
            document.head.appendChild(style);

            return 'Dark theme injected successfully!';
        })()
    `);

    console.log(`   ${colors.green}✓ Dark theme CSS injected!${colors.reset}\n`);

    console.log(`${colors.magenta}The help menu now has a dark theme.${colors.reset}`);
    console.log(`${colors.magenta}The browser window will stay open.${colors.reset}`);
    console.log(`${colors.magenta}Press Ctrl+C to close when done.${colors.reset}\n`);

    // Keep the connection open
    await new Promise(() => {});
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
