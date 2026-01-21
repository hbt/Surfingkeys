#!/usr/bin/env ts-node
/**
 * Test ? and F1 keys for help menu
 */
import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let msgId = 1;

async function httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b));
        }).on('error', reject);
    });
}

async function cdpCall(ws: WebSocket, method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = msgId++;
        const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);
        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                resolve(msg.result);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(ws: WebSocket, expr: string): Promise<any> {
    const r = await cdpCall(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
    return r?.result?.value;
}

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key });
    await new Promise(r => setTimeout(r, 50));
    await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'char', text: key });
    await new Promise(r => setTimeout(r, 50));
    await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key });
    await new Promise(r => setTimeout(r, 100));
}

async function sendFunctionKey(ws: WebSocket, fKey: string): Promise<void> {
    const fNum = parseInt(fKey.replace('F', ''), 10);
    const vk = 111 + fNum;
    await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: fKey, code: fKey, windowsVirtualKeyCode: vk });
    await new Promise(r => setTimeout(r, 50));
    await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: fKey, code: fKey, windowsVirtualKeyCode: vk });
    await new Promise(r => setTimeout(r, 100));
}

async function checkHelpVisible(ws: WebSocket): Promise<any> {
    return evaluate(ws, `
        (function() {
            const host = Array.from(document.body.children).find(c => c.shadowRoot);
            if (!host) return { error: 'no shadow host' };
            const iframe = host.shadowRoot.querySelector('iframe');
            return {
                hostDisplay: getComputedStyle(host).display,
                iframeHeight: iframe ? iframe.offsetHeight : 0
            };
        })()
    `);
}

async function main() {
    console.log('=== Testing ? and F1 Help Keys ===\n');

    // Find background SW
    const targets = JSON.parse(await httpGet(`${CDP_CONFIG.endpoint}/json`));
    const bg = targets.find((t: any) => t.type === 'service_worker' || t.title === 'Surfingkeys');
    if (!bg) throw new Error('Extension not found - service worker dormant?');

    const bgWs = new WebSocket(bg.webSocketDebuggerUrl);
    await new Promise(r => bgWs.on('open', r));
    await cdpCall(bgWs, 'Runtime.enable');

    // Create test tab
    console.log('1. Creating test tab...');
    const tabResult = await new Promise<any>((resolve) => {
        const id = msgId++;
        bgWs.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: `new Promise(r => chrome.tabs.create({ url: 'http://127.0.0.1:9873/hackernews.html', active: true }, tab => r({ id: tab.id })))`,
                returnByValue: true,
                awaitPromise: true
            }
        }));
        bgWs.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) resolve(msg.result?.result?.value);
        });
    });
    console.log('   Tab ID:', tabResult.id);

    await new Promise(r => setTimeout(r, 2000));

    // Find page
    const targets2 = JSON.parse(await httpGet(`${CDP_CONFIG.endpoint}/json`));
    const page = targets2.find((t: any) => t.type === 'page' && t.url.includes('hackernews'));
    if (!page) throw new Error('Page not found');

    const pageWs = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => pageWs.on('open', r));
    await cdpCall(pageWs, 'Runtime.enable');
    await cdpCall(pageWs, 'Input.enable');

    // Test "?" key
    console.log('\n2. Sending "?" key...');
    await sendKey(pageWs, '?');
    await new Promise(r => setTimeout(r, 500));
    const state1 = await checkHelpVisible(pageWs);
    console.log('   Result:', JSON.stringify(state1));
    const qWorks = state1.iframeHeight > 0;

    // Close help
    await sendKey(pageWs, 'Escape');
    await new Promise(r => setTimeout(r, 300));

    // Test F1 key
    console.log('\n3. Sending F1 key...');
    await sendFunctionKey(pageWs, 'F1');
    await new Promise(r => setTimeout(r, 500));
    const state2 = await checkHelpVisible(pageWs);
    console.log('   Result:', JSON.stringify(state2));
    const f1Works = state2.iframeHeight > 0;

    // Summary
    console.log('\n=== Summary ===');
    console.log('"?" works:', qWorks ? 'YES ✓' : 'NO ✗');
    console.log('F1 works:', f1Works ? 'YES ✓' : 'NO ✗');

    pageWs.close();
    bgWs.close();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
