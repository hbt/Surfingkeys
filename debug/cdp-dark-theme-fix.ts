#!/usr/bin/env ts-node
/**
 * CDP Live Injection - Dark Theme Fix (Stronger Approach)
 *
 * Applies dark theme directly to element styles with highest priority.
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
    console.log(`${colors.bright}${colors.cyan}Fixing Dark Theme for Help Menu${colors.reset}\n`);

    console.log(`${colors.yellow}1. Finding page...${colors.reset}`);
    const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
    if (!pageWsUrl) throw new Error('Could not find page');
    console.log(`   ${colors.green}✓ Page found${colors.reset}\n`);

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise(resolve => pageWs.on('open', resolve));
    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 100));

    console.log(`${colors.yellow}2. Checking help menu element...${colors.reset}`);

    const exists = await execPage(pageWs, `
        !!document.getElementById('sk_usage')
    `);

    console.log(`   Help menu exists: ${exists}`);

    if (!exists) {
        console.log(`   ${colors.yellow}⚠ Help menu not visible. Opening it first...${colors.reset}`);

        // Enable input
        pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
        await new Promise(r => setTimeout(r, 100));

        // Send '?' key
        pageWs.send(JSON.stringify({
            id: messageId++,
            method: 'Input.dispatchKeyEvent',
            params: { type: 'rawKeyDown', key: '?' }
        }));
        await new Promise(r => setTimeout(r, 50));

        pageWs.send(JSON.stringify({
            id: messageId++,
            method: 'Input.dispatchKeyEvent',
            params: { type: 'char', text: '?' }
        }));
        await new Promise(r => setTimeout(r, 50));

        pageWs.send(JSON.stringify({
            id: messageId++,
            method: 'Input.dispatchKeyEvent',
            params: { type: 'keyUp', key: '?' }
        }));

        await new Promise(r => setTimeout(r, 500));
        console.log(`   ${colors.green}✓ Help menu opened${colors.reset}\n`);
    } else {
        console.log(`   ${colors.green}✓ Help menu is visible${colors.reset}\n`);
    }

    console.log(`${colors.yellow}3. Applying dark theme with maximum specificity...${colors.reset}`);

    const result = await execPage(pageWs, `
        (function() {
            const usage = document.getElementById('sk_usage');
            if (!usage) {
                return 'Help menu element not found';
            }

            // Remove any existing dark theme
            const existing = document.getElementById('sk-dark-theme-v2');
            if (existing) existing.remove();

            // Create super-specific dark theme
            const style = document.createElement('style');
            style.id = 'sk-dark-theme-v2';
            style.textContent = \`
                /* Ultra-specific dark theme */
                body #sk_usage,
                #sk_usage.sk_theme {
                    background-color: #1e1e1e !important;
                    color: #d4d4d4 !important;
                    border: 1px solid #3c3c3c !important;
                }

                body #sk_usage > div,
                #sk_usage.sk_theme > div {
                    background-color: #1e1e1e !important;
                    color: #d4d4d4 !important;
                }

                /* Section headers - orange */
                body #sk_usage .feature_name,
                body #sk_usage .feature_name > span {
                    color: #f59e42 !important;
                    background-color: transparent !important;
                    font-weight: bold !important;
                }

                /* Key badges - dark gray */
                body #sk_usage kbd,
                body #sk_usage .kbd-span {
                    background-color: #2d2d2d !important;
                    color: #e8e8e8 !important;
                    border: 1px solid #555 !important;
                    padding: 2px 6px !important;
                    border-radius: 3px !important;
                }

                /* All text in help menu */
                body #sk_usage,
                body #sk_usage *:not(.feature_name):not(.feature_name > span) {
                    color: #d4d4d4 !important;
                }

                /* Links */
                body #sk_usage a {
                    color: #4fc3f7 !important;
                }

                body #sk_usage a:hover {
                    color: #81d4fa !important;
                    text-decoration: underline !important;
                }

                /* Scrollbar */
                body #sk_usage::-webkit-scrollbar {
                    width: 12px !important;
                    background-color: #2d2d2d !important;
                }

                body #sk_usage::-webkit-scrollbar-thumb {
                    background-color: #555 !important;
                    border-radius: 6px !important;
                }

                body #sk_usage::-webkit-scrollbar-thumb:hover {
                    background-color: #666 !important;
                }

                /* Annotations */
                body #sk_usage span.annotation {
                    color: #b0b0b0 !important;
                }
            \`;

            document.head.appendChild(style);

            // Also directly modify the element as backup
            usage.style.backgroundColor = '#1e1e1e';
            usage.style.color = '#d4d4d4';

            return 'Dark theme applied successfully!';
        })()
    `);

    console.log(`   ${colors.green}✓ ${result}${colors.reset}\n`);

    console.log(`${colors.magenta}Dark theme has been applied to the help menu.${colors.reset}`);
    console.log(`${colors.magenta}The browser window will stay open.${colors.reset}`);
    console.log(`${colors.magenta}Press Ctrl+C to close when done.${colors.reset}\n`);

    // Keep the connection open
    await new Promise(() => {});
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
