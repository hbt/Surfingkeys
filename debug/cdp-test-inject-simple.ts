#!/usr/bin/env ts-node
/**
 * Simple injection test - just show a red box to verify injection works
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

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

function execPage(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
                    console.log('CDP Error:', msg.error.message);
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

async function main() {
    console.log('Simple Injection Test\n');

    const pageWsUrl = await findPage('www.google.com');
    if (!pageWsUrl) {
        console.log('❌ Could not find Google page');
        process.exit(1);
    }

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise((resolve, reject) => {
        pageWs.on('open', resolve);
        pageWs.on('error', reject);
    });

    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 500));

    console.log('✓ Connected to page\n');

    console.log('Injecting test box...');
    const result = await execPage(pageWs, `
        (function() {
            // Remove old test box
            const old = document.getElementById('test-box-123');
            if (old) old.remove();

            // Create big red box
            const box = document.createElement('div');
            box.id = 'test-box-123';
            box.style.cssText = 'position:fixed;top:50px;left:50px;width:400px;height:200px;background:red;color:white;font-size:24px;display:flex;align-items:center;justify-content:center;z-index:999999;border:5px solid yellow;';
            box.textContent = 'TEST INJECTION WORKS!';
            document.body.appendChild(box);

            // Auto-remove after 5 seconds
            setTimeout(() => box.remove(), 5000);

            return 'Box injected';
        })();
    `);

    console.log('✓ Result:', result);
    console.log('\nYou should see a RED BOX with yellow border on the page for 5 seconds!');

    pageWs.close();
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
