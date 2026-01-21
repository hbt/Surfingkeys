#!/usr/bin/env ts-node
/**
 * CDP - Inspect Shadow DOM and Iframe Structure
 *
 * Finds the help menu inside shadow root and iframe
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m'
};

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
    console.log(`${colors.bright}${colors.cyan}Inspecting Shadow DOM + Iframe Structure${colors.reset}\n`);

    const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
    if (!pageWsUrl) throw new Error('Could not find page');

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise(resolve => pageWs.on('open', resolve));
    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 100));

    console.log(`${colors.yellow}1. Looking for shadow roots...${colors.reset}`);

    const structure = await execPage(pageWs, `
        (function() {
            const result = {
                shadowHosts: [],
                iframes: []
            };

            // Find all elements with shadow roots
            const allElements = document.querySelectorAll('*');
            allElements.forEach(el => {
                if (el.shadowRoot) {
                    const info = {
                        tagName: el.tagName.toLowerCase(),
                        id: el.id,
                        classes: el.className,
                        shadowContent: {
                            childElementCount: el.shadowRoot.childElementCount,
                            children: Array.from(el.shadowRoot.children).map(child => ({
                                tagName: child.tagName.toLowerCase(),
                                id: child.id,
                                classes: child.className,
                                isIframe: child.tagName === 'IFRAME',
                                src: child.tagName === 'IFRAME' ? child.src : null
                            }))
                        }
                    };
                    result.shadowHosts.push(info);
                }
            });

            // Find all iframes (top level)
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                result.iframes.push({
                    tagName: iframe.tagName,
                    id: iframe.id,
                    src: iframe.src,
                    location: 'main document'
                });
            });

            return result;
        })()
    `);

    console.log('\n' + JSON.stringify(structure, null, 2));

    console.log(`\n${colors.yellow}2. Looking for sk_usage in shadow DOM...${colors.reset}`);

    const usageInfo = await execPage(pageWs, `
        (function() {
            // Find shadow root with iframe
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (el.shadowRoot) {
                    const iframe = el.shadowRoot.querySelector('iframe');
                    if (iframe && iframe.contentDocument) {
                        const usage = iframe.contentDocument.getElementById('sk_usage');
                        if (usage) {
                            const styles = iframe.contentWindow.getComputedStyle(usage);
                            const themeStyle = iframe.contentDocument.getElementById('sk_theme');

                            return {
                                found: true,
                                iframeSrc: iframe.src,
                                hostElement: {
                                    tagName: el.tagName,
                                    id: el.id
                                },
                                usageElement: {
                                    display: styles.display,
                                    backgroundColor: styles.backgroundColor,
                                    color: styles.color,
                                    classes: usage.className
                                },
                                themeStyleElement: themeStyle ? {
                                    exists: true,
                                    content: themeStyle.textContent.substring(0, 200)
                                } : null
                            };
                        }
                    }
                }
            }
            return { found: false };
        })()
    `);

    console.log('\n' + JSON.stringify(usageInfo, null, 2));

    pageWs.close();
    process.exit(0);
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
