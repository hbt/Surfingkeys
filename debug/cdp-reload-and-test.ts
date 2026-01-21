#!/usr/bin/env ts-node
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
    const result = await cdpCall(ws, 'Runtime.evaluate', { expression, returnByValue: true });
    return result?.result?.value;
}

async function main() {
    console.log('1. Finding hackernews page...');
    let resp = await httpGet(`${CDP_ENDPOINT}/json`);
    let targets = JSON.parse(resp);
    let page = targets.find((t: any) => t.type === 'page' && t.url.includes('hackernews'));

    if (!page) {
        console.log('   No page found');
        process.exit(1);
    }

    console.log('2. Connecting and reloading page...');
    let ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));
    await cdpCall(ws, 'Page.enable');
    await cdpCall(ws, 'Page.reload');
    ws.close();

    // Wait for reload
    console.log('3. Waiting for reload...');
    await new Promise(r => setTimeout(r, 3000));

    // Reconnect
    console.log('4. Reconnecting...');
    resp = await httpGet(`${CDP_ENDPOINT}/json`);
    targets = JSON.parse(resp);
    page = targets.find((t: any) => t.type === 'page' && t.url.includes('hackernews'));

    if (!page) {
        console.log('   Page gone after reload');
        process.exit(1);
    }

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));
    await cdpCall(ws, 'Runtime.enable');
    await cdpCall(ws, 'Input.enable');

    // Check SK status
    console.log('5. Checking SK status...');
    const status = await evaluate(ws, `
        (function() {
            return {
                hasSK: typeof dispatchSKEvent === 'function',
                frontendHost: !!document.querySelector('#surfingkeys_frontend_host')
            };
        })()
    `);
    console.log('   Status:', JSON.stringify(status));

    if (!status.frontendHost) {
        console.log('   SK still not loaded. Extension may have errors.');
        ws.close();
        process.exit(1);
    }

    // Test "?" key
    console.log('6. Sending "?" key...');
    await cdpCall(ws, 'Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: '?',
        code: 'Slash',
        windowsVirtualKeyCode: 191,
        modifiers: 1
    });
    await new Promise(r => setTimeout(r, 50));
    await cdpCall(ws, 'Input.dispatchKeyEvent', {
        type: 'char',
        text: '?'
    });
    await new Promise(r => setTimeout(r, 50));
    await cdpCall(ws, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: '?',
        code: 'Slash',
        windowsVirtualKeyCode: 191
    });

    await new Promise(r => setTimeout(r, 500));

    // Check help visibility
    console.log('7. Checking help menu...');
    const helpState = await evaluate(ws, `
        (function() {
            const host = document.querySelector('#surfingkeys_frontend_host');
            if (!host || !host.shadowRoot) return { error: 'no shadow' };
            const usage = host.shadowRoot.getElementById('sk_usage');
            return {
                hostDisplay: getComputedStyle(host).display,
                usageDisplay: usage ? getComputedStyle(usage).display : 'not found'
            };
        })()
    `);
    console.log('   Help state:', JSON.stringify(helpState));

    ws.close();
    console.log('\nDone.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
