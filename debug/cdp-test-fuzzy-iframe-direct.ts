#!/usr/bin/env ts-node
/**
 * CDP Test - Direct Iframe Access
 *
 * Tests connecting directly to the frontend iframe's CDP target
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

async function getAllTargets(): Promise<any[]> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    return JSON.parse(resp);
}

async function findBg(): Promise<string> {
    const targets = await getAllTargets();
    const bg = targets.find((t: any) => t.title === 'Surfingkeys' || t.url.includes('background.js'));
    if (!bg) throw new Error('Background not found');
    return bg.webSocketDebuggerUrl;
}

async function createTab(bgWs: WebSocket, url: string): Promise<number> {
    const tab = await new Promise<any>((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                bgWs.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result?.result?.value);
                }
            }
        };

        bgWs.on('message', handler);
        bgWs.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: `
                    new Promise(r => {
                        chrome.tabs.create({
                            url: '${url}',
                            active: true
                        }, tab => r({ id: tab.id }));
                    })
                `,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
    return tab.id;
}

async function findPage(url: string): Promise<string | null> {
    await new Promise(r => setTimeout(r, 1000));
    const targets = await getAllTargets();
    const page = targets.find((t: any) =>
        t.type === 'page' && t.url.includes(url)
    );
    return page ? page.webSocketDebuggerUrl : null;
}

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'rawKeyDown', key: key }
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

async function main() {
    console.log('Step 1: Creating test tab...');
    const bgWs = new WebSocket(await findBg());

    await new Promise(resolve => bgWs.on('open', resolve));
    bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 100));

    const tabId = await createTab(bgWs, 'http://127.0.0.1:9873/hackernews.html');
    console.log(`✓ Tab created\n`);

    console.log('Step 2: Finding page and triggering help menu...');
    const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
    if (!pageWsUrl) throw new Error('Could not find page');

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise(resolve => pageWs.on('open', resolve));
    pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
    await new Promise(r => setTimeout(r, 1000));

    await sendKey(pageWs, '?');
    await new Promise(r => setTimeout(r, 2000)); // Wait for iframe to load
    console.log(`✓ Help menu triggered\n`);

    console.log('Step 3: Checking CDP targets...\n');

    const targets = await getAllTargets();
    console.log(`Found ${targets.length} targets:\n`);

    targets.forEach((t, i) => {
        console.log(`${i}. ${t.type}: ${t.title || '(no title)'}`);
        console.log(`   URL: ${t.url.substring(0, 80)}${t.url.length > 80 ? '...' : ''}`);
        console.log();
    });

    const frontendTargets = targets.filter(t =>
        t.url.includes('frontend.html') ||
        t.title === 'Surfingkeys Frontend' ||
        (t.type === 'iframe' && t.url.includes('chrome-extension://'))
    );

    if (frontendTargets.length > 0) {
        console.log(`\n✓ Found ${frontendTargets.length} frontend iframe target(s):`);
        frontendTargets.forEach(t => {
            console.log(`  Type: ${t.type}`);
            console.log(`  URL: ${t.url}`);
            console.log(`  WebSocket: ${t.webSocketDebuggerUrl}`);
        });
    } else {
        console.log('\n✗ No frontend iframe targets found');
        console.log('  Chrome may not expose iframes as CDP targets by default');
    }

    pageWs.close();
    bgWs.close();
}

main().catch(console.error);
