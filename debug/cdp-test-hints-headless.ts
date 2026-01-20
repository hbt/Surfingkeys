#!/usr/bin/env ts-node
/**
 * CDP Test: Hints in Headless Chrome
 *
 * Tests hint creation in HEADLESS mode.
 *
 * Prerequisites:
 * 1. Set CDP_PORT and CDP_MODE in .env (or use defaults)
 * 2. Run: gchrb-dev or gchrb-dev-headless (depending on mode)
 * 3. Run this test
 *
 * Expected: Hints should work because headless provides "virtual focus"
 *
 * This solves the focus-stealing problem:
 * - No visible window
 * - No focus stealing from user
 * - Can run in background while user works
 * - Can run multiple instances in parallel (different ports)
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
    red: '\x1b[31m'
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
    const bg = targets.find((t: any) =>
        t.title === 'Surfingkeys' ||
        (t.url && t.url.includes('background.js') && t.url.includes('chrome-extension'))
    );
    if (!bg) throw new Error('Surfingkeys background not found');
    return bg.webSocketDebuggerUrl;
}

function exec(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                resolve(msg.error ? null : msg.result?.result?.value);
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression: code, returnByValue: true, awaitPromise: true }
        }));
    });
}

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'keyDown', key: key }
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
        params: { type: 'keyUp', key: key }
    }));
    await new Promise(r => setTimeout(r, 100));
}

async function createTab(bgWs: WebSocket): Promise<number> {
    const tab = await exec(bgWs, `
        new Promise(r => {
            chrome.tabs.create({
                url: 'http://127.0.0.1:9873/hackernews.html',
                active: false  // Doesn't matter in headless, but good practice
            }, tab => r({ id: tab.id }));
        })
    `);
    return tab.id;
}

async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await exec(bgWs, `
        new Promise(r => {
            chrome.tabs.remove(${tabId}, () => r(true));
        })
    `);
}

async function findPageByUrl(): Promise<string | null> {
    await new Promise(r => setTimeout(r, 2000));
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const page = targets.find((t: any) =>
        t.type === 'page' && t.url.includes('127.0.0.1:9873/hackernews.html')
    );
    return page ? page.webSocketDebuggerUrl : null;
}

async function inspectHints(pageWs: WebSocket): Promise<any> {
    return await exec(pageWs, `
        (function() {
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            const shadowRoot = hintsHost?.shadowRoot;

            return {
                hintsHostExists: !!hintsHost,
                hasShadowRoot: !!shadowRoot,
                totalHints: shadowRoot ? Array.from(shadowRoot.querySelectorAll('div'))
                    .filter(d => {
                        const text = (d.textContent || '').trim();
                        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                    }).length : 0,
                sampleHints: shadowRoot ? Array.from(shadowRoot.querySelectorAll('div'))
                    .filter(d => {
                        const text = (d.textContent || '').trim();
                        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                    })
                    .slice(0, 5)
                    .map(d => d.textContent.trim()) : [],
                pageLinks: document.querySelectorAll('a').length
            };
        })()
    `);
}

async function checkHeadlessMode(bgWs: WebSocket): Promise<boolean> {
    const result = await exec(bgWs, `
        new Promise(r => {
            chrome.runtime.getPlatformInfo(info => {
                r({ platform: info });
            });
        })
    `);
    // Note: There's no direct API to check if headless, but we can infer
    return true; // Assume if connected, it's the instance we expect
}

async function main() {
    console.log(`${colors.bright}CDP Test: Hints in Headless Chrome${colors.reset}\n`);
    console.log('This test verifies hint creation works in headless mode\n');
    console.log('='.repeat(70) + '\n');

    try {
        // Check if CDP is available
        const cdpCheck = await new Promise<boolean>((resolve) => {
            const req = http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(1000, () => {
                req.destroy();
                resolve(false);
            });
        });

        if (!cdpCheck) {
            console.log(`${colors.red}✗ Chrome not running on ${CDP_CONFIG.endpoint}${colors.reset}\n`);
            console.log(`Mode: ${CDP_CONFIG.mode}, Port: ${CDP_CONFIG.port}\n`);
            console.log('Please start Chrome first:\n');
            if (CDP_CONFIG.isHeadless) {
                console.log('  gchrb-dev-headless  (for headless mode)\n');
            } else {
                console.log('  gchrb-dev  (for live mode)\n');
            }
            console.log('Then run this test again.\n');
            process.exit(1);
        }

        const bgWs = new WebSocket(await findBg());

        bgWs.on('open', async () => {
            try {
                bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
                await new Promise(r => setTimeout(r, 100));

                console.log('✓ Connected to Chrome (assuming headless mode)\n');

                console.log('Step 1: Creating test tab...');
                const tabId = await createTab(bgWs);
                console.log(`   ${colors.green}✓ Tab created (ID: ${tabId})${colors.reset}\n`);

                console.log('Step 2: Waiting for page to load...');
                const pageWsUrl = await findPageByUrl();
                if (!pageWsUrl) {
                    console.log(`   ${colors.red}✗ Could not find page${colors.reset}`);
                    await closeTab(bgWs, tabId);
                    bgWs.close();
                    return;
                }
                console.log(`   ${colors.green}✓ Page loaded${colors.reset}\n`);

                console.log('Step 3: Connecting to page...');
                const pageWs = new WebSocket(pageWsUrl);

                pageWs.on('open', async () => {
                    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
                    pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
                    await new Promise(r => setTimeout(r, 2000));
                    console.log(`   ${colors.green}✓ Connected${colors.reset}\n`);

                    console.log('Step 4: Checking initial state...');
                    const before = await inspectHints(pageWs);
                    console.log(`   Hints before: ${before.totalHints}`);
                    console.log(`   Links on page: ${before.pageLinks}\n`);

                    console.log('Step 5: Sending \'f\' key...');
                    await sendKey(pageWs, 'f');
                    console.log(`   ${colors.green}✓ Key sent${colors.reset}\n`);

                    console.log('Step 6: Waiting for hints...');
                    await new Promise(r => setTimeout(r, 1000));
                    console.log(`   ${colors.green}✓ Wait complete${colors.reset}\n`);

                    console.log('Step 7: Checking for hints...');
                    const after = await inspectHints(pageWs);
                    console.log(`   Hints after: ${after.totalHints}`);
                    if (after.sampleHints.length > 0) {
                        console.log(`   Sample hints: ${after.sampleHints.join(', ')}\n`);
                    }

                    console.log('='.repeat(70) + '\n');
                    console.log(`${colors.bright}RESULT:${colors.reset}\n`);

                    if (after.totalHints > 0) {
                        console.log(`${colors.green}✅ SUCCESS - Hints work in HEADLESS mode!${colors.reset}\n`);
                        console.log(`   Hints created: ${after.totalHints}`);
                        console.log(`   Links on page: ${after.pageLinks}`);
                        console.log(`   Coverage: ${((after.totalHints / after.pageLinks) * 100).toFixed(1)}%\n`);
                        console.log(`${colors.bright}Benefits of Headless:${colors.reset}`);
                        console.log(`   ✓ No visible window`);
                        console.log(`   ✓ No focus stealing`);
                        console.log(`   ✓ User can work normally`);
                        console.log(`   ✓ Can run multiple instances (different ports)`);
                        console.log(`   ✓ Perfect for CI/CD pipelines\n`);
                    } else {
                        console.log(`${colors.red}❌ UNEXPECTED - Hints should work in headless${colors.reset}\n`);
                        console.log(`   Hints before: ${before.totalHints}`);
                        console.log(`   Hints after:  ${after.totalHints}\n`);
                        console.log(`${colors.yellow}Possible issues:${colors.reset}`);
                        console.log(`   - Surfingkeys not properly loaded`);
                        console.log(`   - Headless mode incompatibility`);
                        console.log(`   - Timing issue (try longer wait)\n`);
                    }

                    console.log('Step 8: Cleaning up...');
                    await closeTab(bgWs, tabId);
                    console.log(`   ${colors.green}✓ Tab closed${colors.reset}\n`);

                    pageWs.close();
                    bgWs.close();
                });

                pageWs.on('error', async (error) => {
                    console.error(`${colors.red}✗ Page error: ${error.message}${colors.reset}`);
                    await closeTab(bgWs, tabId);
                    bgWs.close();
                    process.exit(1);
                });

            } catch (error: any) {
                console.error(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
                bgWs.close();
                process.exit(1);
            }
        });

        bgWs.on('error', (error) => {
            console.error(`${colors.red}✗ Background error: ${error.message}${colors.reset}`);
            process.exit(1);
        });

        bgWs.on('close', () => {
            process.exit(0);
        });

    } catch (error: any) {
        console.error(`${colors.red}✗ Fatal error: ${error}${colors.reset}`);
        process.exit(1);
    }
}

main().catch(error => {
    console.error(`${colors.red}✗ Fatal error: ${error}${colors.reset}`);
    process.exit(1);
});
