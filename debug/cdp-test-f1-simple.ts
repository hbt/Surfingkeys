#!/usr/bin/env ts-node
/**
 * Simple CDP test - send F1 key to existing page
 */

import * as WebSocket from 'ws';
import * as http from 'http';

const CDP_ENDPOINT = 'http://127.0.0.1:9222';
let messageId = 1;

async function httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });
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
                resolve(msg.result);
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(ws: WebSocket, expression: string): Promise<any> {
    const result = await cdpCall(ws, 'Runtime.evaluate', {
        expression,
        returnByValue: true
    });
    return result?.result?.value;
}

async function main() {
    // Find hackernews page
    const resp = await httpGet(`${CDP_ENDPOINT}/json`);
    const targets = JSON.parse(resp);
    const page = targets.find((t: any) => t.type === 'page' && t.url.includes('hackernews'));

    if (!page) {
        console.log('No hackernews page found. Open one first.');
        process.exit(1);
    }

    console.log('Connecting to:', page.url);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));

    await cdpCall(ws, 'Runtime.enable');
    await cdpCall(ws, 'Input.enable');

    // Add debug listener
    console.log('\n1. Adding keydown listener...');
    await evaluate(ws, `
        window._debugKeys = [];
        document.addEventListener('keydown', function(e) {
            window._debugKeys.push({key: e.key, code: e.code, keyCode: e.keyCode});
            console.log('[KEY]', e.key, e.code, e.keyCode);
        }, true);
    `);

    // Send F1
    console.log('2. Sending F1 keyDown...');
    await cdpCall(ws, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'F1',
        code: 'F1',
        windowsVirtualKeyCode: 112,
        nativeVirtualKeyCode: 112
    });
    await new Promise(r => setTimeout(r, 200));

    await cdpCall(ws, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'F1',
        code: 'F1',
        windowsVirtualKeyCode: 112,
        nativeVirtualKeyCode: 112
    });

    await new Promise(r => setTimeout(r, 300));

    // Check if key was received
    console.log('3. Checking captured keys...');
    const keys = await evaluate(ws, 'window._debugKeys');
    console.log('   Captured:', JSON.stringify(keys));

    // Check help visibility
    console.log('4. Checking help menu...');
    const state = await evaluate(ws, `
        (function() {
            const host = document.querySelector('#surfingkeys_frontend_host');
            if (!host) return { error: 'no shadow host' };
            const shadow = host.shadowRoot;
            if (!shadow) return { error: 'no shadow root' };
            const usage = shadow.getElementById('sk_usage');
            return {
                hostDisplay: getComputedStyle(host).display,
                usageDisplay: usage ? getComputedStyle(usage).display : 'not found'
            };
        })()
    `);
    console.log('   State:', JSON.stringify(state));

    // Now try '?' for comparison
    console.log('\n5. Sending "?" key...');
    await cdpCall(ws, 'Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: '?',
        code: 'Slash',
        text: '?',
        unmodifiedText: '?',
        windowsVirtualKeyCode: 191,
        nativeVirtualKeyCode: 191,
        modifiers: 1  // shift
    });
    await new Promise(r => setTimeout(r, 50));
    await cdpCall(ws, 'Input.dispatchKeyEvent', {
        type: 'char',
        text: '?',
        unmodifiedText: '?'
    });
    await new Promise(r => setTimeout(r, 50));
    await cdpCall(ws, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: '?',
        code: 'Slash',
        windowsVirtualKeyCode: 191,
        nativeVirtualKeyCode: 191
    });

    await new Promise(r => setTimeout(r, 300));

    // Check keys again
    const keys2 = await evaluate(ws, 'window._debugKeys');
    console.log('6. All captured keys:', JSON.stringify(keys2));

    // Check help visibility again
    const state2 = await evaluate(ws, `
        (function() {
            const host = document.querySelector('#surfingkeys_frontend_host');
            if (!host) return { error: 'no shadow host' };
            const shadow = host.shadowRoot;
            if (!shadow) return { error: 'no shadow root' };
            const usage = shadow.getElementById('sk_usage');
            return {
                hostDisplay: getComputedStyle(host).display,
                usageDisplay: usage ? getComputedStyle(usage).display : 'not found'
            };
        })()
    `);
    console.log('7. State after "?":', JSON.stringify(state2));

    ws.close();
    console.log('\nDone.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
