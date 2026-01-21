#!/usr/bin/env ts-node
/**
 * CDP Screenshot - Options Page with Dark Theme
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import * as fs from 'fs';

const PROXY_PORT = 9623;
const PROXY_HOST = '127.0.0.1';

let messageId = 1;

async function findOptionsPage(): Promise<string | null> {
    return new Promise((resolve, reject) => {
        http.get(`http://${PROXY_HOST}:${PROXY_PORT}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const targets = JSON.parse(body);
                    const page = targets.find((t: any) =>
                        t.type === 'page' && t.url.includes('options.html')
                    );
                    resolve(page ? page.id : null);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function captureScreenshot(targetId: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        http.get(`http://${PROXY_HOST}:${PROXY_PORT}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const targets = JSON.parse(body);
                    const page = targets.find((t: any) => t.id === targetId);

                    if (!page) {
                        reject(new Error('Page not found'));
                        return;
                    }

                    const ws = new WebSocket(page.webSocketDebuggerUrl);
                    ws.on('open', () => {
                        ws.send(JSON.stringify({
                            id: 1,
                            method: 'Page.captureScreenshot',
                            params: { format: 'png' }
                        }));
                    });

                    ws.on('message', (data) => {
                        const msg = JSON.parse(data.toString());
                        if (msg.id === 1) {
                            ws.close();
                            if (msg.result?.data) {
                                resolve(Buffer.from(msg.result.data, 'base64'));
                            } else {
                                reject(new Error('No screenshot data'));
                            }
                        }
                    });

                    ws.on('error', reject);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('Finding options page...');
    const targetId = await findOptionsPage();

    if (!targetId) {
        console.error('Options page not found');
        process.exit(1);
    }

    console.log(`Found target: ${targetId}`);
    console.log('Capturing screenshot...');

    const screenshot = await captureScreenshot(targetId);
    const path = '/tmp/options-dark-theme.png';
    fs.writeFileSync(path, screenshot);

    console.log(`Screenshot saved to: ${path}`);
    console.log(`Size: ${screenshot.length} bytes`);

    process.exit(0);
}

main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
});
