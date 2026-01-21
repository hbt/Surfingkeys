#!/usr/bin/env ts-node
/**
 * Trigger test errors in extension context
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

async function findExtension(): Promise<string | null> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const ext = targets.find((t: any) => t.url.includes('chrome-extension://'));
    return ext ? ext.webSocketDebuggerUrl : null;
}

function exec(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

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
            params: {
                expression: code,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
}

async function main() {
    console.log('Triggering test errors...\n');

    const extWsUrl = await findExtension();
    if (!extWsUrl) {
        console.log('❌ Extension context not found');
        process.exit(1);
    }

    const extWs = new WebSocket(extWsUrl);
    await new Promise((resolve, reject) => {
        extWs.on('open', resolve);
        extWs.on('error', reject);
    });

    extWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 500));

    console.log('✓ Connected to extension context\n');

    console.log('Triggering errors...');
    await exec(extWs, `
        setTimeout(() => {
            throw new Error('TEST: Demo error #1');
        }, 100);
        'error1_triggered'
    `);
    await new Promise(r => setTimeout(r, 500));

    await exec(extWs, `
        Promise.reject(new Error('TEST: Demo rejection #2'));
        'rejection_triggered'
    `);
    await new Promise(r => setTimeout(r, 500));

    console.log('✓ Triggered 2 test errors\n');

    const count = await exec(extWs, `
        new Promise(r => {
            chrome.storage.local.get(['surfingkeys_errors'], (result) => {
                r((result.surfingkeys_errors || []).length);
            });
        })
    `);

    console.log(`✓ Stored errors: ${count}\n`);
    console.log('Now run: npx ts-node debug/cdp-demo-error-viewer-v2.ts');

    extWs.close();
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
