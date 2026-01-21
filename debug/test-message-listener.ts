/**
 * Test script: Check if the extension's message listener is working
 */

import puppeteer from 'puppeteer-core';
import * as http from 'node:http';

const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);

async function fetchJson(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${CDP_PORT}${path}`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
    });
}

async function findServiceWorker(): Promise<string | null> {
    const targets = await fetchJson('/json');
    const sw = targets.find((t: any) =>
        t.type === 'service_worker' &&
        t.url?.includes('background.js')
    );
    return sw ? sw.webSocketDebuggerUrl : null;
}

async function getCDPEndpoint(): Promise<string> {
    const data = await fetchJson('/json/version');
    return data.webSocketDebuggerUrl;
}

async function main() {
    console.log('Connecting to Chrome DevTools Protocol...');
    const endpoint = await getCDPEndpoint();

    const browser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
        defaultViewport: null
    });

    console.log('Finding service worker...');
    const swWsUrl = await findServiceWorker();

    if (!swWsUrl) {
        console.error('✗ Service worker not found');
        process.exit(1);
    }

    console.log('Connecting to service worker...');
    const swTarget = await browser.waitForTarget(t => t.url().includes('background.js'));
    const worker = await swTarget.worker();

    if (!worker) {
        console.error('✗ Could not get worker');
        process.exit(1);
    }

    console.log('Sending message to extension...');
    const result = await worker.evaluate(async () => {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'openDebugTabs' },
                (response) => {
                    console.log('[TEST] Response:', response);
                    resolve(response);
                }
            );
        });
    });

    console.log('✓ Message sent, response:', result);

    await browser.disconnect();
}

main().catch(console.error);
