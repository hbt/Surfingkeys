#!/usr/bin/env ts-node
import * as WebSocket from 'ws';
import * as http from 'http';

async function main() {
    const resp = await new Promise<string>((resolve) => {
        http.get('http://127.0.0.1:9222/json', (res) => {
            let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b));
        });
    });
    const targets = JSON.parse(resp);
    const page = targets.find((t: any) => t.type === 'page' && t.url.includes('hackernews'));
    if (!page) { console.log('No page'); process.exit(1); }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    // Enable console
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));

    // Listen for console messages
    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Runtime.consoleAPICalled') {
            const args = msg.params.args.map((a: any) => a.value || a.description || a.type).join(' ');
            console.log('[CONSOLE]', msg.params.type + ':', args);
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            console.log('[EXCEPTION]', JSON.stringify(msg.params.exceptionDetails));
        }
        if (msg.method === 'Log.entryAdded') {
            console.log('[LOG]', msg.params.entry.text);
        }
    });

    await new Promise(r => setTimeout(r, 500));

    // Simulate F1 by dispatching keyboard event
    console.log('\nTriggering F1 via JS KeyboardEvent...');
    ws.send(JSON.stringify({ id: 10, method: 'Runtime.evaluate', params: {
        expression: `
            const ev = new KeyboardEvent('keydown', { key: 'F1', code: 'F1', keyCode: 112, bubbles: true });
            document.dispatchEvent(ev);
            'dispatched';
        `,
        returnByValue: true
    }}));

    // Wait and collect logs
    await new Promise(r => setTimeout(r, 2000));

    console.log('\nDone');
    ws.close();
}
main();
