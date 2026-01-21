#!/usr/bin/env ts-node
import * as WebSocket from 'ws';
import * as http from 'http';

const CDP_ENDPOINT = 'http://127.0.0.1:9222';
let messageId = 1;

async function main() {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_ENDPOINT}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const page = targets.find((t: any) => t.type === 'page' && t.url.includes('hackernews'));
    if (!page) { console.log('No hackernews page'); process.exit(1); }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));

    const expression = `
        (function() {
            return {
                hasSK: typeof dispatchSKEvent === 'function',
                hasNormal: typeof Normal !== 'undefined',
                frontendHost: !!document.querySelector('#surfingkeys_frontend_host'),
                skFrame: !!document.querySelector('iframe[src*="frontend"]'),
                bodyHTML: document.body.innerHTML.substring(0, 500)
            };
        })()
    `;

    const id = messageId++;
    ws.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true }
    }));

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
            console.log('SK Status:', JSON.stringify(msg.result?.result?.value, null, 2));
            ws.close();
            process.exit(0);
        }
    });

    setTimeout(() => process.exit(1), 5000);
}

main();
