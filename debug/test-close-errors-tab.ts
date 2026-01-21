/**
 * Test script: Close the chrome://extensions/?errors tab to test self-healing
 */

import puppeteer from 'puppeteer-core';
import * as http from 'node:http';

const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);

async function getCDPEndpoint(): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${CDP_PORT}/json/version`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve(data.webSocketDebuggerUrl);
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
    });
}

async function main() {
    console.log('Connecting to Chrome DevTools Protocol...');
    const endpoint = await getCDPEndpoint();

    const browser = await puppeteer.connect({
        browserWSEndpoint: endpoint,
        defaultViewport: null
    });

    console.log('Finding chrome://extensions/?errors tab...');
    const pages = await browser.pages();

    const errorsTab = pages.find(page =>
        page.url().includes('chrome://extensions/?errors=')
    );

    if (errorsTab) {
        console.log('Found errors tab, closing it...');
        await errorsTab.close();
        console.log('✓ Errors tab closed');
    } else {
        console.log('✗ Errors tab not found');
    }

    await browser.disconnect();
}

main().catch(console.error);
