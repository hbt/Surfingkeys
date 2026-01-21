#!/usr/bin/env ts-node
/**
 * CDP - Inspect Help Menu DOM Structure
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

async function main() {
    console.log('Inspecting Help Menu DOM\n');

    const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
    if (!pageWsUrl) throw new Error('Could not find page');

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise(resolve => pageWs.on('open', resolve));
    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 100));

    console.log('Searching for help menu elements...\n');

    const info = await execPage(pageWs, `
        (function() {
            // Look for help menu in main document
            const usage = document.querySelector('#sk_usage');
            const popup = document.querySelector('#sk_popup');
            const editor = document.querySelector('#sk_editor');

            // Get all iframes
            const iframes = Array.from(document.querySelectorAll('iframe'));

            const result = {
                mainDoc: {
                    sk_usage: usage ? {
                        display: window.getComputedStyle(usage).display,
                        backgroundColor: window.getComputedStyle(usage).backgroundColor,
                        color: window.getComputedStyle(usage).color,
                        classes: usage.className
                    } : null,
                    sk_popup: !!popup,
                    sk_editor: !!editor
                },
                iframes: iframes.map(iframe => ({
                    src: iframe.src,
                    id: iframe.id
                })),
                allDivs: Array.from(document.querySelectorAll('div[id^="sk_"]')).map(d => ({
                    id: d.id,
                    display: window.getComputedStyle(d).display
                }))
            };

            return result;
        })()
    `);

    console.log('DOM Inspection Results:');
    console.log(JSON.stringify(info, null, 2));

    pageWs.close();
    process.exit(0);
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
