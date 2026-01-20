#!/usr/bin/env ts-node
/**
 * CDP Breakpoint-Style Debugging - Hint Creation ('f' key)
 *
 * Demonstrates step-by-step execution inspection:
 * - Press 'f' key
 * - Pause at different points
 * - Inspect state (DOM, variables, call stack)
 * - Verify hints appear/don't appear based on timing
 *
 * This shows you HOW to debug with breakpoint-like pauses
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

interface CDPTarget {
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
}

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

function breakpoint(num: number, desc: string): void {
    console.log(`${colors.bright}${colors.yellow}🔴 BREAKPOINT ${num}:${colors.reset} ${desc}`);
}

function inspect(label: string, value: any): void {
    const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    console.log(`${colors.magenta}   🔍 ${label}:${colors.reset}`);
    if (typeof value === 'object') {
        const lines = valueStr.split('\n');
        lines.forEach(line => console.log(`      ${line}`));
    } else {
        console.log(`      ${valueStr}`);
    }
}

async function findExtensionBackground(): Promise<string> {
    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });

    const targets: CDPTarget[] = JSON.parse(data);
    const bg = targets.find(t =>
        t.title === 'Surfingkeys' ||
        t.url.includes('_generated_background_page.html') ||
        (t.type === 'service_worker' && t.url.includes('background.js'))
    );

    if (!bg) throw new Error('Surfingkeys background not found');
    return bg.webSocketDebuggerUrl;
}

function executeInBackground(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) reject(new Error(msg.error.message));
                else resolve(msg.result?.result?.value);
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

function executeInPage(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) reject(new Error(msg.error.message));
                else resolve(msg.result?.result?.value);
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

async function createTab(bgWs: WebSocket): Promise<number> {
    const tab = await executeInBackground(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.create({
                url: 'http://127.0.0.1:9873/hackernews.html',
                active: true
            }, (tab) => resolve({ id: tab.id }));
        })
    `);
    return tab.id;
}

async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await executeInBackground(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.remove(${tabId}, () => resolve(true));
        })
    `);
}

async function findContentPage(): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });

    const targets: CDPTarget[] = JSON.parse(data);
    const page = targets.find(t =>
        t.type === 'page' && t.url.includes('127.0.0.1:9873/hackernews.html')
    );

    if (!page) throw new Error('Content page not found');
    return page.webSocketDebuggerUrl;
}

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'keyDown', key: key }
    }));
    await new Promise(resolve => setTimeout(resolve, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'char', text: key }
    }));
    await new Promise(resolve => setTimeout(resolve, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'keyUp', key: key }
    }));
}

async function inspectDOM(pageWs: WebSocket): Promise<any> {
    return await executeInPage(pageWs, `
        (function() {
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            const shadowRoot = hintsHost?.shadowRoot;

            return {
                hintsHostExists: !!hintsHost,
                hasShadowRoot: !!shadowRoot,
                shadowRootChildCount: shadowRoot?.children.length || 0,
                hintDivs: shadowRoot ? Array.from(shadowRoot.querySelectorAll('div'))
                    .filter(d => {
                        const text = (d.textContent || '').trim();
                        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                    })
                    .map(d => ({
                        text: d.textContent.trim(),
                        visible: d.offsetParent !== null
                    }))
                    .slice(0, 5) // First 5 hints
                : [],
                totalHints: shadowRoot ? Array.from(shadowRoot.querySelectorAll('div'))
                    .filter(d => {
                        const text = (d.textContent || '').trim();
                        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                    }).length
                : 0,
                pageLinks: document.querySelectorAll('a').length
            };
        })()
    `);
}

async function main() {
    console.log(`${colors.bright}CDP Breakpoint-Style Debugging - Hint Creation${colors.reset}\n`);
    console.log('This demonstrates step-by-step inspection with pauses\n');

    const bgWsUrl = await findExtensionBackground();
    const bgWs = new WebSocket(bgWsUrl);

    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log('Setting up test environment...');
            const tabId = await createTab(bgWs);
            console.log(`✓ Test tab created (ID: ${tabId})`);

            const pageWsUrl = await findContentPage();
            const pageWs = new WebSocket(pageWsUrl);

            pageWs.on('open', async () => {
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('✓ Page loaded and ready\n');

                section('BREAKPOINT DEBUGGING: Hint Creation with \'f\' Key');

                // BREAKPOINT 1: Before any action
                breakpoint(1, 'BEFORE pressing \'f\' key');
                const state1 = await inspectDOM(pageWs);
                inspect('DOM State', {
                    hintsHostExists: state1.hintsHostExists,
                    hasShadowRoot: state1.hasShadowRoot,
                    totalHints: state1.totalHints,
                    pageLinks: state1.pageLinks
                });
                console.log(`   ${colors.green}✓ Expected: No hints visible${colors.reset}`);
                console.log(`   ${colors.green}✓ Actual: ${state1.totalHints} hints${colors.reset}\n`);

                // Give page focus
                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Input.dispatchMouseEvent',
                    params: {
                        type: 'mousePressed',
                        x: 100,
                        y: 100,
                        button: 'left',
                        clickCount: 1
                    }
                }));
                await new Promise(resolve => setTimeout(resolve, 100));
                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Input.dispatchMouseEvent',
                    params: {
                        type: 'mouseReleased',
                        x: 100,
                        y: 100,
                        button: 'left',
                        clickCount: 1
                    }
                }));
                await new Promise(resolve => setTimeout(resolve, 200));

                // BREAKPOINT 2: Send 'f' key
                breakpoint(2, 'SENDING \'f\' key event');
                console.log(`   ${colors.yellow}→ Dispatching keyDown, char, keyUp events...${colors.reset}\n`);
                await sendKey(pageWs, 'f');

                // BREAKPOINT 3: Immediately after keypress (too early?)
                breakpoint(3, 'IMMEDIATELY after \'f\' key (0ms delay)');
                const state3 = await inspectDOM(pageWs);
                inspect('DOM State', {
                    totalHints: state3.totalHints,
                    sampleHints: state3.hintDivs
                });
                if (state3.totalHints === 0) {
                    console.log(`   ${colors.red}⚠️  TOO EARLY - No hints created yet${colors.reset}\n`);
                } else {
                    console.log(`   ${colors.green}✓ Hints already created!${colors.reset}\n`);
                }

                // BREAKPOINT 4: After 100ms
                await new Promise(resolve => setTimeout(resolve, 100));
                breakpoint(4, 'After 100ms delay');
                const state4 = await inspectDOM(pageWs);
                inspect('DOM State', {
                    totalHints: state4.totalHints,
                    sampleHints: state4.hintDivs
                });
                if (state4.totalHints === 0) {
                    console.log(`   ${colors.red}⚠️  Still no hints${colors.reset}\n`);
                } else {
                    console.log(`   ${colors.green}✓ Hints created (${state4.totalHints} hints)${colors.reset}\n`);
                }

                // BREAKPOINT 5: After 500ms
                await new Promise(resolve => setTimeout(resolve, 400));
                breakpoint(5, 'After 500ms delay (should be complete)');
                const state5 = await inspectDOM(pageWs);
                inspect('DOM State', {
                    totalHints: state5.totalHints,
                    sampleHints: state5.hintDivs
                });
                console.log(`   ${colors.green}✓ Final state: ${state5.totalHints} hints for ${state5.pageLinks} links${colors.reset}\n`);

                // BREAKPOINT 6: After 1000ms
                await new Promise(resolve => setTimeout(resolve, 500));
                breakpoint(6, 'After 1000ms total - Visual confirmation');
                const state6 = await inspectDOM(pageWs);
                inspect('Final Hint Count', state6.totalHints);
                inspect('Visible Hints', state6.hintDivs);

                section('SUMMARY: What We Learned');

                console.log(`${colors.bright}Timeline of Hint Creation:${colors.reset}\n`);
                console.log(`  Breakpoint 1 (before):     ${state1.totalHints} hints`);
                console.log(`  Breakpoint 3 (0ms after):  ${state3.totalHints} hints ${state3.totalHints > 0 ? colors.green + '← Created!' + colors.reset : colors.red + '← Too early' + colors.reset}`);
                console.log(`  Breakpoint 4 (100ms):      ${state4.totalHints} hints ${state4.totalHints > 0 ? colors.green + '← Created!' + colors.reset : ''}`);
                console.log(`  Breakpoint 5 (500ms):      ${state5.totalHints} hints`);
                console.log(`  Breakpoint 6 (1000ms):     ${state6.totalHints} hints\n`);

                console.log(`${colors.bright}Key Insights:${colors.reset}\n`);
                console.log(`  • Hint creation happens ${state3.totalHints > 0 ? 'immediately (<0ms)' : 'within 100ms'}`);
                console.log(`  • Total hints created: ${state6.totalHints}`);
                console.log(`  • Total links on page: ${state6.pageLinks}`);
                console.log(`  • Coverage: ${state6.pageLinks > 0 ? ((state6.totalHints / state6.pageLinks) * 100).toFixed(1) : 0}%\n`);

                console.log(`${colors.bright}This Technique Shows You:${colors.reset}\n`);
                console.log(`  ✓ How to pause at specific points in execution`);
                console.log(`  ✓ How to inspect DOM state at each breakpoint`);
                console.log(`  ✓ How timing affects what you see`);
                console.log(`  ✓ How to verify when changes actually occur\n`);

                console.log(`${colors.yellow}Next Steps:${colors.reset}\n`);
                console.log(`  • You can add more breakpoints at different times`);
                console.log(`  • You can inspect other state (variables, network, etc.)`);
                console.log(`  • You can use Debugger.pause() for true breakpoints`);
                console.log(`  • You can capture call stacks with Error().stack\n`);

                await closeTab(bgWs, tabId);
                console.log(`${colors.green}✓ Test complete${colors.reset}\n`);

                pageWs.close();
                bgWs.close();
            });

            pageWs.on('error', async (error) => {
                console.error('❌ Page error:', error.message);
                await closeTab(bgWs, tabId);
                bgWs.close();
                process.exit(1);
            });

        } catch (error: any) {
            console.error('❌ Error:', error.message);
            bgWs.close();
            process.exit(1);
        }
    });

    bgWs.on('error', (error) => {
        console.error('❌ Background error:', error.message);
        process.exit(1);
    });

    bgWs.on('close', () => {
        process.exit(0);
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
