#!/usr/bin/env ts-node
/**
 * CDP Debug Script - Investigate F1 Help Menu Issue
 *
 * Tests whether:
 * 1. api.Front.showUsage exists
 * 2. F1 mapping is registered
 * 3. F1 key event triggers the handler
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
    red: '\x1b[31m',
    magenta: '\x1b[35m'
};

async function httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });
}

async function findTarget(predicate: (t: any) => boolean): Promise<any> {
    const resp = await httpGet(`${CDP_CONFIG.endpoint}/json`);
    const targets = JSON.parse(resp);
    return targets.find(predicate);
}

async function cdpCall(ws: WebSocket, method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result);
                }
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(ws: WebSocket, expression: string, awaitPromise = false): Promise<any> {
    const result = await cdpCall(ws, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise
    });
    return result?.result?.value;
}

async function main() {
    console.log(`${colors.bright}${colors.cyan}=== Debugging F1 Help Menu ===${colors.reset}\n`);

    // 1. Find background service worker
    console.log(`${colors.yellow}1. Finding background service worker...${colors.reset}`);
    const bg = await findTarget(t => t.title === 'Surfingkeys' || t.url.includes('background.js'));
    if (!bg) throw new Error('Background not found');
    console.log(`   ${colors.green}✓ Found${colors.reset}\n`);

    const bgWs = new WebSocket(bg.webSocketDebuggerUrl);
    await new Promise(resolve => bgWs.on('open', resolve));
    await cdpCall(bgWs, 'Runtime.enable');

    // 2. Create test tab
    console.log(`${colors.yellow}2. Creating test tab...${colors.reset}`);
    const tabResult = await evaluate(bgWs, `
        new Promise(r => {
            chrome.tabs.create({
                url: 'http://127.0.0.1:9873/hackernews.html',
                active: true
            }, tab => r({ id: tab.id }));
        })
    `, true);
    console.log(`   ${colors.green}✓ Tab ID: ${tabResult.id}${colors.reset}\n`);

    // Wait for page and content script to load
    await new Promise(r => setTimeout(r, 2000));

    // 3. Find page target
    console.log(`${colors.yellow}3. Finding page target...${colors.reset}`);
    const page = await findTarget(t => t.type === 'page' && t.url.includes('hackernews.html'));
    if (!page) throw new Error('Page not found');
    console.log(`   ${colors.green}✓ Found${colors.reset}\n`);

    const pageWs = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(resolve => pageWs.on('open', resolve));
    await cdpCall(pageWs, 'Runtime.enable');
    await cdpCall(pageWs, 'Input.enable');

    // 4. Check if Front.showUsage exists in content script context
    console.log(`${colors.yellow}4. Checking api.Front.showUsage in page context...${colors.reset}`);
    const checkShowUsage = await evaluate(pageWs, `
        (function() {
            // Check window.Front or any exposed API
            if (typeof Front !== 'undefined' && Front.showUsage) {
                return { exists: true, type: typeof Front.showUsage };
            }
            if (typeof api !== 'undefined' && api.Front && api.Front.showUsage) {
                return { exists: true, type: typeof api.Front.showUsage };
            }
            return { exists: false, windowKeys: Object.keys(window).filter(k => k.includes('surf') || k.includes('Front') || k.includes('api')).slice(0, 10) };
        })()
    `);
    console.log(`   Result: ${JSON.stringify(checkShowUsage)}\n`);

    // 5. Check content script's front object via SK event system
    console.log(`${colors.yellow}5. Testing dispatchSKEvent for showUsage...${colors.reset}`);
    const testSKEvent = await evaluate(pageWs, `
        (function() {
            // Try to access through content script globals
            if (typeof dispatchSKEvent === 'function') {
                return { hasSKEvent: true };
            }
            // Check if we can find the front object
            return { hasSKEvent: false };
        })()
    `);
    console.log(`   Result: ${JSON.stringify(testSKEvent)}\n`);

    // 6. Add a key event listener to debug
    console.log(`${colors.yellow}6. Adding debug key listener...${colors.reset}`);
    await evaluate(pageWs, `
        document.addEventListener('keydown', function(e) {
            console.log('[DEBUG] keydown:', e.key, e.code, e.keyCode);
        }, true);
    `);
    console.log(`   ${colors.green}✓ Added${colors.reset}\n`);

    // Enable console logging
    await cdpCall(pageWs, 'Log.enable');
    pageWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Log.entryAdded' || msg.method === 'Runtime.consoleAPICalled') {
            const entry = msg.params?.entry || msg.params;
            if (entry) {
                console.log(`   ${colors.cyan}[Console]${colors.reset}`, JSON.stringify(entry.args || entry.text || entry));
            }
        }
    });
    await cdpCall(pageWs, 'Runtime.enable');

    // 7. Send F1 key
    console.log(`${colors.yellow}7. Sending F1 key...${colors.reset}`);
    await cdpCall(pageWs, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'F1',
        code: 'F1',
        windowsVirtualKeyCode: 112
    });
    await new Promise(r => setTimeout(r, 100));
    await cdpCall(pageWs, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'F1',
        code: 'F1',
        windowsVirtualKeyCode: 112
    });
    console.log(`   ${colors.green}✓ Sent${colors.reset}\n`);

    await new Promise(r => setTimeout(r, 500));

    // 8. Check if help menu is visible
    console.log(`${colors.yellow}8. Checking if help menu appeared...${colors.reset}`);
    const helpVisible = await evaluate(pageWs, `
        (function() {
            // Check for SK iframe or usage element
            const iframe = document.querySelector('iframe[src*="frontend"]');
            const skUsage = document.getElementById('sk_usage');
            const shadowHost = document.querySelector('#surfingkeys_frontend_host');
            return {
                hasIframe: !!iframe,
                hasUsage: !!skUsage,
                hasShadowHost: !!shadowHost,
                shadowHostDisplay: shadowHost ? getComputedStyle(shadowHost).display : null
            };
        })()
    `);
    console.log(`   Result: ${JSON.stringify(helpVisible)}\n`);

    // 9. Also try sending '?' for comparison
    console.log(`${colors.yellow}9. Sending '?' key for comparison...${colors.reset}`);
    await cdpCall(pageWs, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: '?',
        code: 'Slash',
        shiftKey: true,
        windowsVirtualKeyCode: 191
    });
    await new Promise(r => setTimeout(r, 50));
    await cdpCall(pageWs, 'Input.dispatchKeyEvent', {
        type: 'char',
        text: '?'
    });
    await new Promise(r => setTimeout(r, 50));
    await cdpCall(pageWs, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: '?',
        code: 'Slash',
        shiftKey: true,
        windowsVirtualKeyCode: 191
    });
    console.log(`   ${colors.green}✓ Sent${colors.reset}\n`);

    await new Promise(r => setTimeout(r, 500));

    // 10. Check again
    console.log(`${colors.yellow}10. Checking help menu after '?'...${colors.reset}`);
    const helpVisible2 = await evaluate(pageWs, `
        (function() {
            const shadowHost = document.querySelector('#surfingkeys_frontend_host');
            return {
                hasShadowHost: !!shadowHost,
                shadowHostDisplay: shadowHost ? getComputedStyle(shadowHost).display : null,
                shadowHostVisibility: shadowHost ? getComputedStyle(shadowHost).visibility : null
            };
        })()
    `);
    console.log(`   Result: ${JSON.stringify(helpVisible2)}\n`);

    console.log(`${colors.magenta}Browser stays open. Press Ctrl+C to quit.${colors.reset}`);
    await new Promise(() => {});
}

main().catch(err => {
    console.error(`${colors.red}❌ Fatal: ${err.message}${colors.reset}`);
    process.exit(1);
});
