#!/usr/bin/env ts-node
/**
 * CDP - Inspect Iframe Content in Detail
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
    console.log('Inspecting Iframe Content\n');

    const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
    if (!pageWsUrl) throw new Error('Could not find page');

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise(resolve => pageWs.on('open', resolve));
    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 100));

    const info = await execPage(pageWs, `
        (function() {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (!el.shadowRoot) continue;

                const iframe = el.shadowRoot.querySelector('iframe.sk_ui');
                if (!iframe) continue;

                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc) {
                        return {
                            found: true,
                            iframeSrc: iframe.src,
                            documentReady: iframeDoc.readyState,
                            bodyHTML: iframeDoc.body ? iframeDoc.body.innerHTML.substring(0, 1000) : null,
                            headChildren: iframeDoc.head ? Array.from(iframeDoc.head.children).map(child => ({
                                tagName: child.tagName,
                                id: child.id,
                                textContent: child.textContent ? child.textContent.substring(0, 100) : null
                            })) : null,
                            sk_usage: iframeDoc.getElementById('sk_usage') ? {
                                display: iframeDoc.getElementById('sk_usage').style.display,
                                classes: iframeDoc.getElementById('sk_usage').className
                            } : null,
                            sk_theme: iframeDoc.getElementById('sk_theme') ? {
                                exists: true,
                                tagName: iframeDoc.getElementById('sk_theme').tagName,
                                content: iframeDoc.getElementById('sk_theme').textContent
                            } : null,
                            allStyleElements: Array.from(iframeDoc.querySelectorAll('style')).map(s => ({
                                id: s.id,
                                classes: s.className,
                                hasContent: s.textContent && s.textContent.length > 0
                            }))
                        };
                    }
                } catch (e) {
                    return { error: e.toString() };
                }
            }
            return { found: false };
        })()
    `);

    console.log(JSON.stringify(info, null, 2));

    pageWs.close();
    process.exit(0);
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
