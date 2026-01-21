#!/usr/bin/env ts-node
/**
 * CDP Create Tab - Opens chrome://extensions errors page
 *
 * Simple test script that uses Chrome DevTools Protocol to:
 * 1. Connect to the Surfingkeys background service worker
 * 2. Use chrome.tabs.create() to open chrome://extensions errors page
 * 3. Report the created tab details
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    red: '\x1b[31m'
};

/**
 * Find the background service worker WebSocket URL
 */
async function findBackground(): Promise<string> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const bg = targets.find((t: any) =>
        t.title === 'Surfingkeys' || t.url.includes('background.js')
    );

    if (!bg) {
        throw new Error('Background service worker not found');
    }

    return bg.webSocketDebuggerUrl;
}

/**
 * Execute JavaScript in the background service worker context
 */
function execBackground(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for response'));
        }, 5000);

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
                awaitPromise: true  // Critical for Chrome APIs that return Promises
            }
        }));
    });
}

async function main() {
    console.log(`${colors.bright}${colors.cyan}CDP Create Tab - Chrome Extensions Errors${colors.reset}\n`);

    try {
        // Step 1: Connect to background service worker
        console.log(`${colors.yellow}[1/3]${colors.reset} Connecting to background service worker...`);
        const bgWsUrl = await findBackground();
        const bgWs = new WebSocket(bgWsUrl);

        await new Promise<void>((resolve, reject) => {
            bgWs.on('open', () => resolve());
            bgWs.on('error', reject);
        });

        // Enable Runtime domain
        bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
        await new Promise(r => setTimeout(r, 100));

        console.log(`${colors.green}✓${colors.reset} Connected to background\n`);

        // Step 2: Create new tab
        console.log(`${colors.yellow}[2/3]${colors.reset} Creating new tab to chrome://extensions/?errors=aajlcoiaogpknhgninhopncaldipjdnp...`);

        const tabInfo = await execBackground(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.create({
                    url: 'chrome://extensions/?errors=aajlcoiaogpknhgninhopncaldipjdnp',
                    active: true
                }, (tab) => {
                    resolve({
                        id: tab.id,
                        url: tab.url,
                        index: tab.index,
                        active: tab.active
                    });
                });
            })
        `);

        console.log(`${colors.green}✓${colors.reset} Tab created successfully`);
        console.log(`  ${colors.cyan}Tab ID:${colors.reset}      ${tabInfo.id}\n`);

        // Step 3: Wait for page to load and get URL
        console.log(`${colors.yellow}[3/4]${colors.reset} Waiting for page to load...`);
        await new Promise(r => setTimeout(r, 3000));  // Wait 3 seconds for page to load

        const loadedTab = await execBackground(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.get(${tabInfo.id}, (tab) => {
                    resolve({
                        id: tab.id,
                        url: tab.url,
                        title: tab.title,
                        status: tab.status,
                        index: tab.index,
                        active: tab.active
                    });
                });
            })
        `);

        console.log(`${colors.green}✓${colors.reset} Page loaded\n`);

        // Step 4: Display loaded tab details
        console.log(`${colors.yellow}[4/4]${colors.reset} Loaded tab details:`);
        console.log(`  ${colors.cyan}Tab ID:${colors.reset}      ${loadedTab.id}`);
        console.log(`  ${colors.cyan}URL:${colors.reset}         ${loadedTab.url}`);
        console.log(`  ${colors.cyan}Title:${colors.reset}       ${loadedTab.title}`);
        console.log(`  ${colors.cyan}Status:${colors.reset}      ${loadedTab.status}`);
        console.log(`  ${colors.cyan}Index:${colors.reset}       ${loadedTab.index}`);
        console.log(`  ${colors.cyan}Active:${colors.reset}      ${loadedTab.active}`);
        console.log();

        if (loadedTab.url.includes('chrome://extensions')) {
            console.log(`${colors.green}${colors.bright}✅ Success!${colors.reset} Tab confirmed at chrome://extensions\n`);
        } else {
            console.log(`${colors.yellow}⚠️  Warning:${colors.reset} Tab URL is ${loadedTab.url}\n`);
        }

        bgWs.close();
        process.exit(0);

    } catch (error: any) {
        console.error(`${colors.red}❌ Error:${colors.reset}`, error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main().catch(error => {
    console.error(`${colors.red}❌ Fatal error:${colors.reset}`, error);
    process.exit(1);
});
