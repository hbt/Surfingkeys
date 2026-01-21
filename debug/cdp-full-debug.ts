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
    console.log('=== Full CDP Debug ===\n');

    const resp = await httpGet(`${CDP_ENDPOINT}/json`);
    const targets = JSON.parse(resp);

    console.log('All targets:');
    targets.forEach((t: any) => {
        console.log(`  [${t.type}] ${t.title.substring(0, 50)} - ${t.id}`);
    });

    // Find the page that has the frontend iframe as child
    const frontendIframe = targets.find((t: any) => t.type === 'iframe' && t.url.includes('frontend.html'));
    if (frontendIframe) {
        console.log(`\nFrontend iframe parent: ${frontendIframe.parentId}`);
        const parentPage = targets.find((t: any) => t.id === frontendIframe.parentId);
        if (parentPage) {
            console.log(`Parent page: ${parentPage.url}`);
        }
    }

    // Find hackernews page
    const hnPage = targets.find((t: any) => t.type === 'page' && t.url.includes('hackernews'));
    if (!hnPage) {
        console.log('\nNo hackernews page');
        process.exit(1);
    }

    console.log(`\nConnecting to hackernews page: ${hnPage.id}`);
    const ws = new WebSocket(hnPage.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));
    await cdpCall(ws, 'Runtime.enable');

    // List all execution contexts
    console.log('\nExecution contexts:');
    const contexts: any[] = [];
    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Runtime.executionContextCreated') {
            contexts.push(msg.params.context);
            console.log(`  Context: ${msg.params.context.id} - ${msg.params.context.origin} - ${msg.params.context.name}`);
        }
    });

    // Force context discovery
    await cdpCall(ws, 'Page.enable');
    await new Promise(r => setTimeout(r, 500));

    // Check in each context for SK
    console.log('\nChecking for Surfingkeys in main context...');
    const mainCheck = await evaluate(ws, `
        (function() {
            // Check various ways SK might be present
            return {
                hasDispatchSKEvent: typeof dispatchSKEvent === 'function',
                hasNormal: typeof Normal !== 'undefined',
                hasFront: typeof front !== 'undefined',
                frontendHost: !!document.querySelector('#surfingkeys_frontend_host'),
                skFrame: !!document.querySelector('iframe[src*="frontend"]'),
                documentReady: document.readyState,
                allScripts: Array.from(document.querySelectorAll('script')).map(s => s.src).filter(s => s)
            };
        })()
    `);
    console.log(JSON.stringify(mainCheck, null, 2));

    // Try isolated world (content script context)
    console.log('\nTrying to execute in content script world...');
    try {
        const isolatedResult = await cdpCall(ws, 'Runtime.evaluate', {
            expression: `
                (function() {
                    return {
                        hasDispatchSKEvent: typeof dispatchSKEvent === 'function',
                        hasNormal: typeof Normal !== 'undefined',
                        hasFront: typeof front !== 'undefined',
                    };
                })()
            `,
            returnByValue: true,
            contextId: undefined, // Try default
            includeCommandLineAPI: true
        });
        console.log('Isolated result:', JSON.stringify(isolatedResult?.result?.value, null, 2));
    } catch (e: any) {
        console.log('Error:', e.message);
    }

    // Check if there are errors in the service worker
    console.log('\nChecking service worker...');
    const sw = targets.find((t: any) => t.type === 'service_worker');
    if (sw) {
        const swWs = new WebSocket(sw.webSocketDebuggerUrl);
        await new Promise(resolve => swWs.on('open', resolve));
        await cdpCall(swWs, 'Runtime.enable');

        // Check for recent errors
        const swCheck = await new Promise<any>((resolve) => {
            const id = messageId++;
            swWs.send(JSON.stringify({
                id,
                method: 'Runtime.evaluate',
                params: {
                    expression: `
                        (function() {
                            return {
                                ready: true,
                                hasChrome: typeof chrome !== 'undefined',
                                hasTabs: typeof chrome !== 'undefined' && typeof chrome.tabs !== 'undefined'
                            };
                        })()
                    `,
                    returnByValue: true
                }
            }));
            swWs.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.id === id) resolve(msg.result?.result?.value);
            });
            setTimeout(() => resolve(null), 3000);
        });
        console.log('SW status:', JSON.stringify(swCheck, null, 2));
        swWs.close();
    }

    ws.close();
    console.log('\nDone.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
