#!/usr/bin/env ts-node
/**
 * CDP Debug - Check iframe height when help menu is open
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

async function findPage(url: string): Promise<string | null> {
    await new Promise(r => setTimeout(r, 500));
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

async function execPage(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
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

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'keyDown', key: key }
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
    console.log('Checking iframe height detection...\n');

    const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
    if (!pageWsUrl) throw new Error('Could not find page');

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise(resolve => pageWs.on('open', resolve));
    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
    await new Promise(r => setTimeout(r, 500));

    // Check ALL shadow roots and iframes
    console.log('0. All shadow roots and iframes:');
    const allShadows = await execPage(pageWs, `
        (function() {
            const result = [];
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (el.shadowRoot) {
                    const iframes = el.shadowRoot.querySelectorAll('iframe');
                    result.push({
                        hostTag: el.tagName,
                        hostId: el.id,
                        iframeCount: iframes.length,
                        iframes: Array.from(iframes).map(ifr => ({
                            class: ifr.className,
                            src: ifr.src,
                            height: ifr.style.height,
                            offsetHeight: ifr.offsetHeight
                        }))
                    });
                }
            }
            return result;
        })()
    `);
    console.log(JSON.stringify(allShadows, null, 2));

    // Check initial state
    console.log('\n1. Initial state (help closed):');
    const initial = await execPage(pageWs, `
        (function() {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (el.shadowRoot) {
                    const iframe = el.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe) {
                        const rect = iframe.getBoundingClientRect();
                        const style = window.getComputedStyle(iframe);
                        return {
                            found: true,
                            boundingHeight: rect.height,
                            boundingWidth: rect.width,
                            boundingTop: rect.top,
                            boundingBottom: rect.bottom,
                            styleHeight: style.height,
                            inlineHeight: iframe.style.height,
                            offsetHeight: iframe.offsetHeight,
                            clientHeight: iframe.clientHeight,
                            visible: rect.height > 100
                        };
                    }
                }
            }
            return { found: false, reason: 'no sk_ui iframe' };
        })()
    `);
    console.log(JSON.stringify(initial, null, 2));

    // Press ? to show help
    console.log('\n2. Pressing ? key...');
    await sendKey(pageWs, '?');

    // Wait for animation
    await new Promise(r => setTimeout(r, 1000));

    // Check help state - all iframes and their heights
    console.log('\n3. After pressing ? (all iframes):');
    const afterHelp = await execPage(pageWs, `
        (function() {
            const result = [];
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (el.shadowRoot) {
                    const iframes = el.shadowRoot.querySelectorAll('iframe');
                    for (const iframe of iframes) {
                        const rect = iframe.getBoundingClientRect();
                        result.push({
                            class: iframe.className,
                            src: iframe.src ? iframe.src.substring(0, 50) + '...' : 'empty',
                            inlineHeight: iframe.style.height,
                            boundingHeight: rect.height,
                            offsetHeight: iframe.offsetHeight
                        });
                    }
                }
            }
            return result;
        })()
    `);
    console.log(JSON.stringify(afterHelp, null, 2));

    // Also check if help triggered via browser console
    console.log('\n3b. Check window.skFront:');
    const skCheck = await execPage(pageWs, `
        typeof window.skFront !== 'undefined' ? 'exists' : 'not found'
    `);
    console.log(skCheck);

    // Press Escape to close
    console.log('\n4. Pressing Escape...');
    await sendKey(pageWs, 'Escape');
    await new Promise(r => setTimeout(r, 500));

    // Check closed state
    console.log('\n5. After Escape (help closed):');
    const afterEscape = await execPage(pageWs, `
        (function() {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (el.shadowRoot) {
                    const iframe = el.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe) {
                        const rect = iframe.getBoundingClientRect();
                        const style = window.getComputedStyle(iframe);
                        return {
                            found: true,
                            height: rect.height,
                            styleHeight: style.height,
                            visible: rect.height > 100
                        };
                    }
                }
            }
            return { found: false, reason: 'no sk_ui iframe' };
        })()
    `);
    console.log(JSON.stringify(afterEscape, null, 2));

    pageWs.close();
    process.exit(0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
