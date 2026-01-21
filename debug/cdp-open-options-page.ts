#!/usr/bin/env ts-node
/**
 * CDP Helper - Open Extension Options Page
 *
 * Opens the extension options page in a new tab.
 *
 * Usage:
 * npm run debug:cdp:live debug/cdp-open-options-page.ts
 */

import * as WebSocket from 'ws';
import * as http from 'http';

const PROXY_PORT = 9623;
const PROXY_HOST = '127.0.0.1';
const EXTENSION_ID = 'aajlcoiaogpknhgninhopncaldipjdnp';
const OPTIONS_URL = `chrome-extension://${EXTENSION_ID}/pages/options.html`;

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

async function findBrowser(): Promise<string | null> {
    return new Promise((resolve, reject) => {
        http.get(`http://${PROXY_HOST}:${PROXY_PORT}/json/version`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve(data.webSocketDebuggerUrl);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function execBrowser(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
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
                // Ignore
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
    console.log(`${colors.bright}${colors.cyan}Opening Extension Options Page${colors.reset}\n`);

    console.log(`${colors.yellow}1. Connecting to browser...${colors.reset}`);
    const browserWsUrl = await findBrowser();
    if (!browserWsUrl) {
        console.error(`${colors.red}❌ Could not find browser. Make sure Chrome is running with remote debugging.${colors.reset}`);
        process.exit(1);
    }
    console.log(`   ${colors.green}✓ Connected to browser${colors.reset}\n`);

    const browserWs = new WebSocket(browserWsUrl);
    await new Promise(resolve => browserWs.on('open', resolve));
    browserWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 100));

    console.log(`${colors.yellow}2. Opening options page: ${OPTIONS_URL}${colors.reset}`);

    const result = await execBrowser(browserWs, `
        (async function() {
            // Open the options page in a new tab
            window.open('${OPTIONS_URL}', '_blank');
            return 'Options page opened in new tab';
        })()
    `);

    console.log(`   ${colors.green}✓ ${result}${colors.reset}\n`);
    console.log(`${colors.magenta}Now run: npm run debug:cdp:live debug/cdp-options-page-dark-theme.ts${colors.reset}\n`);

    process.exit(0);
}

main().catch(error => {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
});
