/**
 * Test script: Close both chrome://extensions tabs to test tab creation
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

    console.log('Finding chrome://extensions tabs...');
    const pages = await browser.pages();

    const extensionTabs = pages.filter(page =>
        page.url().startsWith('chrome://extensions')
    );

    console.log(`Found ${extensionTabs.length} chrome://extensions tabs`);

    for (const tab of extensionTabs) {
        console.log(`Closing tab: ${tab.url()}`);
        await tab.close();
    }

    console.log('✓ All chrome://extensions tabs closed');

    await browser.disconnect();
}

main().catch(console.error);
