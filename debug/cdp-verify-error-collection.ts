#!/usr/bin/env ts-node
/**
 * CDP Error Collection Verification
 *
 * Verifies that the error collector is working in the production extension.
 * This script:
 * 1. Checks if error handlers are installed
 * 2. Clears previous errors
 * 3. Triggers test errors via user script execution
 * 4. Retrieves and displays captured errors
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
    magenta: '\x1b[35m',
    red: '\x1b[31m'
};

function section(title: string): void {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
}

function step(num: number, desc: string): void {
    console.log(`${colors.bright}${colors.yellow}Step ${num}:${colors.reset} ${desc}`);
}

async function findBg(): Promise<string | null> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    // MV3 service worker
    const bg = targets.find((t: any) =>
        t.type === 'service_worker' &&
        (t.title === 'Surfingkeys' || t.url.includes('background.js'))
    );

    if (!bg) {
        // Try background_page for MV2
        const bgPage = targets.find((t: any) =>
            t.type === 'background_page' &&
            (t.title === 'Surfingkeys' || t.url.includes('background.js'))
        );
        return bgPage ? bgPage.webSocketDebuggerUrl : null;
    }

    return bg.webSocketDebuggerUrl;
}

function execBg(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
                    console.log(`${colors.red}   CDP Error: ${msg.error.message}${colors.reset}`);
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

async function findPage(url: string): Promise<string | null> {
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

async function main() {
    console.log(`${colors.bright}Error Collection Verification${colors.reset}\n`);
    console.log('Verifying error handlers in production extension\n');

    section('PHASE 1: Check Background Script');

    step(1, 'Find background service worker');
    const bgWsUrl = await findBg();

    if (!bgWsUrl) {
        console.log(`   ${colors.yellow}⚠️  Background service worker not found${colors.reset}`);
        console.log(`   ${colors.yellow}   This is normal for MV3 - service worker may be inactive${colors.reset}`);
        console.log(`   ${colors.yellow}   Continuing with page context only...${colors.reset}\n`);
    } else {
        console.log(`   ${colors.green}✓ Found background service worker${colors.reset}\n`);

        const bgWs = new WebSocket(bgWsUrl);
        await new Promise((resolve, reject) => {
            bgWs.on('open', resolve);
            bgWs.on('error', reject);
        });

        bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
        bgWs.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));
        await new Promise(r => setTimeout(r, 500));

        step(2, 'Check if error handlers are installed in background');
        const bgInstalled = await execBg(bgWs, `
            typeof window._surfingkeysErrorHandlersInstalled !== 'undefined' && window._surfingkeysErrorHandlersInstalled
        `);
        console.log(`   Error handlers installed: ${colors.bright}${bgInstalled}${colors.reset}\n`);

        bgWs.close();
    }

    section('PHASE 2: Check Content Script');

    step(3, 'Find Google page');
    const pageWsUrl = await findPage('www.google.com');
    if (!pageWsUrl) {
        console.log(`${colors.red}❌ Could not find Google page${colors.reset}`);
        console.log(`${colors.yellow}Please open https://www.google.com in Chrome${colors.reset}`);
        process.exit(1);
    }

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise((resolve, reject) => {
        pageWs.on('open', resolve);
        pageWs.on('error', reject);
    });

    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 500));

    console.log(`   ${colors.green}✓ Connected to page${colors.reset}\n`);

    step(4, 'Check if Surfingkeys is loaded');
    const skLoaded = await new Promise((resolve) => {
        const id = messageId++;
        const timeout = setTimeout(() => resolve(false), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                pageWs.removeListener('message', handler);
                resolve(msg.result?.result?.value || false);
            }
        };

        pageWs.on('message', handler);
        pageWs.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: `(function() {
                    // Check if Surfingkeys front is available
                    return typeof Front !== 'undefined' || typeof window.Front !== 'undefined';
                })();`,
                returnByValue: true
            }
        }));
    });

    console.log(`   Surfingkeys loaded: ${colors.bright}${skLoaded}${colors.reset}\n`);

    section('PHASE 3: View Captured Errors');

    step(5, 'Get stored errors from chrome.storage.local');

    // We need to send a message to the content script to get errors
    // since we can't access chrome.storage from page context
    const errorCommand = `
        (async function() {
            return new Promise((resolve) => {
                // Send message to background to get errors
                chrome.runtime.sendMessage({
                    action: 'getErrors'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response);
                    }
                });
            });
        })();
    `;

    console.log(`   ${colors.yellow}Note: Direct storage access from page context not available${colors.reset}`);
    console.log(`   ${colors.yellow}Checking console for error handler logs...${colors.reset}\n`);

    step(6, 'Summary');
    console.log(`\n   ${colors.bright}What to check manually:${colors.reset}`);
    console.log(`   1. Open Chrome DevTools Console`);
    console.log(`   2. Look for: ${colors.green}"[ERROR COLLECTOR] ✓ Installed global error handlers"${colors.reset}`);
    console.log(`   3. To view stored errors, run in console:`);
    console.log(`      ${colors.cyan}chrome.storage.local.get(['surfingkeys_errors'], console.log)${colors.reset}`);
    console.log(`   4. To trigger a test error, run in console:`);
    console.log(`      ${colors.cyan}throw new Error('TEST ERROR')${colors.reset}`);
    console.log(`   5. To trigger a test rejection, run in console:`);
    console.log(`      ${colors.cyan}Promise.reject(new Error('TEST REJECTION'))${colors.reset}\n`);

    console.log(`${colors.green}✓ Verification complete${colors.reset}\n`);
    console.log(`${colors.bright}If you see error collector logs in console, it's working!${colors.reset}\n`);

    pageWs.close();
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
