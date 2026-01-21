#!/usr/bin/env ts-node
/**
 * CDP Script - Take Screenshot of Help Menu
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import * as fs from 'fs';
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

async function captureScreenshot(ws: WebSocket): Promise<string> {
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
                    resolve(msg.result.data);
                }
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({
            id,
            method: 'Page.captureScreenshot',
            params: {
                format: 'png',
                captureBeyondViewport: false
            }
        }));
    });
}

async function main() {
    console.log('Taking screenshot...');

    const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
    if (!pageWsUrl) throw new Error('Could not find page');

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise(resolve => pageWs.on('open', resolve));

    pageWs.send(JSON.stringify({ id: messageId++, method: 'Page.enable' }));
    await new Promise(r => setTimeout(r, 100));

    const screenshot = await captureScreenshot(pageWs);
    const filepath = '/tmp/surfingkeys-help-menu.png';
    fs.writeFileSync(filepath, screenshot, 'base64');

    console.log(`✓ Screenshot saved: ${filepath}`);

    pageWs.close();
    process.exit(0);
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
