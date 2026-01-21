#!/usr/bin/env ts-node
/**
 * CDP Live Inspection & Dark Theme - Options Page
 *
 * Connects to extension options page, inspects CSS, and injects dark theme.
 *
 * Usage:
 * npm run debug:cdp:live debug/cdp-options-page-dark-theme.ts
 */

import * as WebSocket from 'ws';
import * as http from 'http';

const PROXY_PORT = 9623;
const PROXY_HOST = '127.0.0.1';
const messageIdMap = new Map<string, number>();

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    red: '\x1b[31m'
};

function getMessageId(wsKey: string): number {
    if (!messageIdMap.has(wsKey)) {
        messageIdMap.set(wsKey, 1);
    }
    const id = messageIdMap.get(wsKey)!;
    messageIdMap.set(wsKey, id + 1);
    return id;
}

async function findPage(searchPattern: string): Promise<{ url: string, wsUrl: string } | null> {
    await new Promise(r => setTimeout(r, 500));

    return new Promise((resolve, reject) => {
        http.get(`http://${PROXY_HOST}:${PROXY_PORT}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const targets = JSON.parse(body);
                    console.log(`${colors.cyan}Found ${targets.length} targets${colors.reset}`);

                    // List all pages
                    targets.forEach((t: any) => {
                        if (t.type === 'page') {
                            console.log(`  - ${t.url}`);
                        }
                    });

                    // Find matching page
                    const page = targets.find((t: any) =>
                        t.type === 'page' && t.url.includes(searchPattern)
                    );

                    if (page) {
                        resolve({ url: page.url, wsUrl: page.webSocketDebuggerUrl });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function execOnPage(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const wsKey = ws.url;
        const id = getMessageId(wsKey);
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            try {
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
            } catch (e) {
                // Ignore parse errors from other messages
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
    console.log(`${colors.bright}${colors.cyan}Options Page Dark Theme Inspector${colors.reset}\n`);

    // Step 1: Find the options page
    console.log(`${colors.yellow}1. Finding extension options page...${colors.reset}`);
    const pageInfo = await findPage('options.html');

    if (!pageInfo) {
        console.error(`${colors.red}❌ Could not find options page. Make sure it's open in Chrome.${colors.reset}`);
        process.exit(1);
    }

    console.log(`   ${colors.green}✓ Found: ${pageInfo.url}${colors.reset}\n`);

    // Connect to the page
    const pageWs = new WebSocket(pageInfo.wsUrl);
    await new Promise(resolve => pageWs.on('open', resolve));
    pageWs.send(JSON.stringify({ id: getMessageId(pageWs.url), method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 100));

    // Step 2: Inspect the current CSS and DOM structure
    console.log(`${colors.yellow}2. Inspecting page structure and existing CSS...${colors.reset}`);

    const domInfo = await execOnPage(pageWs, `
        (function() {
            const bodyStyle = window.getComputedStyle(document.body);
            const htmlStyle = window.getComputedStyle(document.documentElement);
            const styleSheets = Array.from(document.styleSheets).map(sheet => ({
                href: sheet.href,
                disabled: sheet.disabled
            }));

            return {
                bodyBg: bodyStyle.backgroundColor,
                bodyColor: bodyStyle.color,
                htmlBg: htmlStyle.backgroundColor,
                styleSheets: styleSheets,
                title: document.title,
                bodyClasses: document.body.className
            };
        })()
    `);

    console.log(`   ${colors.green}Current state:${colors.reset}`);
    console.log(`   - Title: ${domInfo.title}`);
    console.log(`   - Body BG: ${domInfo.bodyBg}`);
    console.log(`   - Body Text: ${domInfo.bodyColor}`);
    console.log(`   - CSS Files: ${domInfo.styleSheets.length}`);
    domInfo.styleSheets.forEach((sheet: any) => {
        console.log(`     • ${sheet.href || '(inline)'}`);
    });
    console.log('');

    // Step 3: Inject dark theme CSS
    console.log(`${colors.yellow}3. Injecting dark theme CSS...${colors.reset}`);

    await execOnPage(pageWs, `
        (function() {
            // Remove existing dark theme style if present
            const existingStyle = document.getElementById('sk-options-dark-theme');
            if (existingStyle) {
                existingStyle.remove();
            }

            // Create and inject dark theme styles
            const style = document.createElement('style');
            style.id = 'sk-options-dark-theme';
            style.textContent = \`
                /* Dark Theme for Extension Options Page */
                :root {
                    --sk-dark-bg: #1e1e1e;
                    --sk-dark-surface: #2d2d2d;
                    --sk-dark-text: #e0e0e0;
                    --sk-dark-secondary: #b0b0b0;
                    --sk-dark-accent: #4fc3f7;
                    --sk-dark-hover: #3d3d3d;
                }

                html, body {
                    background-color: #1e1e1e !important;
                    color: #e0e0e0 !important;
                }

                * {
                    background-color: inherit;
                    color: inherit;
                }

                /* Override specific elements */
                body, html {
                    background-color: #1e1e1e !important;
                    color: #e0e0e0 !important;
                }

                input, textarea, select {
                    background-color: #2d2d2d !important;
                    color: #e0e0e0 !important;
                    border-color: #444 !important;
                }

                input:focus, textarea:focus, select:focus {
                    background-color: #3d3d3d !important;
                    border-color: #4fc3f7 !important;
                    outline-color: #4fc3f7 !important;
                }

                button, [type="button"], [type="submit"], [type="reset"] {
                    background-color: #3d3d3d !important;
                    color: #e0e0e0 !important;
                    border-color: #555 !important;
                }

                button:hover, [type="button"]:hover, [type="submit"]:hover {
                    background-color: #4d4d4d !important;
                }

                a {
                    color: #4fc3f7 !important;
                }

                a:hover {
                    color: #81d4fa !important;
                }

                /* Scrollbar */
                ::-webkit-scrollbar {
                    width: 12px;
                    background-color: #2d2d2d;
                }

                ::-webkit-scrollbar-thumb {
                    background-color: #555;
                    border-radius: 6px;
                }

                ::-webkit-scrollbar-thumb:hover {
                    background-color: #666;
                }

                /* Tables and lists */
                table, tr, td, th {
                    border-color: #444 !important;
                }

                tr:hover {
                    background-color: #3d3d3d !important;
                }

                /* Code blocks */
                pre, code {
                    background-color: #2d2d2d !important;
                    color: #d4d4d4 !important;
                    border-color: #444 !important;
                }

                /* Checkboxes and radio buttons */
                input[type="checkbox"], input[type="radio"] {
                    accent-color: #4fc3f7 !important;
                }

                /* Labels */
                label {
                    color: #e0e0e0 !important;
                }

                /* Dividers and borders */
                hr, .divider {
                    border-color: #444 !important;
                }

                /* Placeholder text */
                ::placeholder {
                    color: #888 !important;
                }
            \`;
            document.head.appendChild(style);
            return 'Dark theme injected successfully!';
        })()
    `);

    console.log(`   ${colors.green}✓ Dark theme CSS injected!${colors.reset}\n`);

    // Step 4: Verify the changes
    console.log(`${colors.yellow}4. Verifying dark theme application...${colors.reset}`);

    const verifyResult = await execOnPage(pageWs, `
        (function() {
            const bodyStyle = window.getComputedStyle(document.body);
            const inputStyle = document.querySelector('input') ? window.getComputedStyle(document.querySelector('input')!) : null;

            return {
                bodyBg: bodyStyle.backgroundColor,
                bodyColor: bodyStyle.color,
                inputBg: inputStyle?.backgroundColor || 'N/A',
                inputColor: inputStyle?.color || 'N/A',
                styleInject: !!document.getElementById('sk-options-dark-theme')
            };
        })()
    `);

    console.log(`   ${colors.green}After injection:${colors.reset}`);
    console.log(`   - Body BG: ${verifyResult.bodyBg}`);
    console.log(`   - Body Text: ${verifyResult.bodyColor}`);
    console.log(`   - Input BG: ${verifyResult.inputBg}`);
    console.log(`   - Input Text: ${verifyResult.inputColor}`);
    console.log(`   - Style Injected: ${verifyResult.styleInject ? '✓' : '✗'}`);
    console.log('');

    console.log(`${colors.magenta}${colors.bright}✓ Dark theme successfully applied!${colors.reset}`);
    console.log(`${colors.magenta}The browser window will stay open.${colors.reset}`);
    console.log(`${colors.magenta}Press Ctrl+C to close when done.${colors.reset}\n`);

    // Keep the connection open
    await new Promise(() => {});
}

main().catch(error => {
    console.error(`${colors.red}❌ Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
});
