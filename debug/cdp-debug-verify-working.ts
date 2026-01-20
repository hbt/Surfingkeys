#!/usr/bin/env ts-node
/**
 * CDP State Inspector - Functional Test
 *
 * Instead of checking globals, actually USE Surfingkeys and see what happens
 */

import * as WebSocket from 'ws';
import * as http from 'http';

interface CDPTarget {
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
}

let messageId = 1;

async function findExtensionBackground(): Promise<string> {
    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get('http://localhost:9222/json', (res) => {
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
    await new Promise(resolve => setTimeout(resolve, 100));
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
        const req = http.get('http://localhost:9222/json', (res) => {
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

async function main() {
    console.log('\n🔍 Surfingkeys Functional State Test\n');
    console.log('Testing by actually USING Surfingkeys, not just checking globals\n');
    console.log('='.repeat(60));

    const bgWsUrl = await findExtensionBackground();
    const bgWs = new WebSocket(bgWsUrl);

    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log('\n1. Creating test tab...');
            const tabId = await createTab(bgWs);
            console.log(`   ✓ Created`);

            const pageWsUrl = await findContentPage();
            console.log('\n2. Connecting to page...');
            const pageWs = new WebSocket(pageWsUrl);

            pageWs.on('open', async () => {
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
                pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('   ✓ Connected and waiting for page load');

                console.log('\n' + '='.repeat(60));
                console.log('FUNCTIONAL TESTS');
                console.log('='.repeat(60) + '\n');

                // Test 1: Can we scroll?
                console.log('Test 1: Scrolling (j key)');
                const scrollBefore = await executeInPage(pageWs, 'window.scrollY');
                console.log(`   Before: scrollY = ${scrollBefore}`);

                await sendKey(pageWs, 'j');
                await new Promise(resolve => setTimeout(resolve, 300));

                const scrollAfter = await executeInPage(pageWs, 'window.scrollY');
                console.log(`   After:  scrollY = ${scrollAfter}`);

                if (scrollAfter > scrollBefore) {
                    console.log('   ✅ Surfingkeys IS WORKING (page scrolled)');
                } else {
                    console.log('   ❌ No scroll detected');
                }

                // Test 2: Check what's actually in window
                console.log('\nTest 2: What globals exist in window?');
                const globals = await executeInPage(pageWs, `
                    Object.keys(window).filter(k =>
                        k.includes('surf') ||
                        k.includes('Surf') ||
                        k === 'Front' ||
                        k === 'Normal' ||
                        k === 'Mode' ||
                        k === 'runtime'
                    )
                `);
                console.log('   Surfingkeys-related keys:', globals);

                // Test 3: Check all window keys (first 50)
                console.log('\nTest 3: First 50 window properties:');
                const allKeys = await executeInPage(pageWs, `
                    Object.keys(window).slice(0, 50)
                `);
                console.log('  ', allKeys.join(', '));

                console.log('\n' + '='.repeat(60));
                console.log('\nConclusion:');
                if (scrollAfter > scrollBefore) {
                    console.log('✅ Surfingkeys is DEFINITELY working');
                    console.log('   The \'j\' key scrolled the page, which means Surfingkeys');
                    console.log('   captured the keypress and executed the scrollDown command.');
                    console.log('\n   The globals might not be exposed in window scope,');
                    console.log('   or they might be in a closure/module scope instead.');
                } else {
                    console.log('❌ Surfingkeys does not appear to be working');
                }

                console.log('\n' + '='.repeat(60) + '\n');

                await closeTab(bgWs, tabId);
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
