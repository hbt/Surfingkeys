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
    const resp = await httpGet(`${CDP_ENDPOINT}/json`);
    const targets = JSON.parse(resp);

    // Find page with frontend iframe child
    const frontendIframe = targets.find((t: any) => t.url.includes('frontend.html'));
    if (!frontendIframe) {
        console.log('No frontend iframe found');
        process.exit(1);
    }

    const parentPage = targets.find((t: any) => t.id === frontendIframe.parentId);
    console.log('Page with SK:', parentPage.url);

    const ws = new WebSocket(parentPage.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));
    await cdpCall(ws, 'Runtime.enable');

    console.log('\nChecking shadow DOM structure...');
    const check = await evaluate(ws, `
        (function() {
            // Look for any shadow hosts
            const allElements = document.body.querySelectorAll('*');
            const shadowHosts = [];
            allElements.forEach(el => {
                if (el.shadowRoot) {
                    shadowHosts.push({
                        tag: el.tagName,
                        id: el.id,
                        class: el.className
                    });
                }
            });

            // Check for SK specific elements
            const skHost = document.getElementById('surfingkeys_frontend_host');
            const skFrame = document.querySelector('iframe[src*="frontend"]');

            // Check body direct children
            const bodyChildren = Array.from(document.body.children).map(c => ({
                tag: c.tagName,
                id: c.id,
                hasShadow: !!c.shadowRoot
            }));

            return {
                shadowHosts,
                skHost: skHost ? { id: skHost.id, hasShadow: !!skHost.shadowRoot } : null,
                skFrame: skFrame ? { src: skFrame.src } : null,
                bodyChildren: bodyChildren.slice(-5) // Last 5 children
            };
        })()
    `);
    console.log(JSON.stringify(check, null, 2));

    if (check.skHost && check.skHost.hasShadow) {
        console.log('\nChecking inside shadow root...');
        const shadowCheck = await evaluate(ws, `
            (function() {
                const host = document.getElementById('surfingkeys_frontend_host');
                if (!host || !host.shadowRoot) return { error: 'no shadow' };
                const sr = host.shadowRoot;
                return {
                    childCount: sr.children.length,
                    children: Array.from(sr.children).map(c => ({
                        tag: c.tagName,
                        id: c.id,
                        display: getComputedStyle(c).display
                    })),
                    usage: sr.getElementById('sk_usage') ? 'found' : 'not found'
                };
            })()
        `);
        console.log(JSON.stringify(shadowCheck, null, 2));
    }

    ws.close();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
