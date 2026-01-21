#!/usr/bin/env ts-node
/**
 * Reload extension and check if it creates chrome://extensions tab
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

async function findExtensionsTab(): Promise<string | null> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const tab = targets.find((t: any) =>
        t.type === 'page' && t.url && t.url.includes('chrome://extensions')
    );
    return tab ? tab.webSocketDebuggerUrl : null;
}

async function reloadExtensionAndListen() {
    const tabWsUrl = await findExtensionsTab();
    if (!tabWsUrl) {
        console.error('❌ chrome://extensions tab not found');
        process.exit(1);
    }

    const ws = new WebSocket(tabWsUrl);

    ws.on('open', async () => {
        ws.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));

        console.log('✓ Connected to chrome://extensions tab');
        console.log('Listening for console logs...\n');

        // Listen for console messages
        ws.on('message', (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.method === 'Runtime.consoleAPICalled') {
                const args = msg.params.args || [];
                const texts = args.map((arg: any) =>
                    arg.type === 'string' ? arg.value : JSON.stringify(arg.value)
                );
                console.log(`[CONSOLE] ${texts.join(' ')}`);
            }
        });

        await new Promise(r => setTimeout(r, 500));

        // Reload extension
        console.log('Reloading extension...\n');
        const reloadCode = `
            (async function() {
                const extensionId = 'aajlcoiaogpknhgninhopncaldipjdnp';
                return new Promise((resolve) => {
                    chrome.developerPrivate.reload(extensionId, {}, () => {
                        const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
                        resolve({ reloaded: !err, error: err });
                    });
                });
            })();
        `;

        ws.send(JSON.stringify({
            id: messageId++,
            method: 'Runtime.evaluate',
            params: {
                expression: reloadCode,
                awaitPromise: true,
                returnByValue: true
            }
        }));

        // Wait for logs
        await new Promise(r => setTimeout(r, 3000));

        // Count tabs
        const tabsResp = await new Promise<string>((resolve, reject) => {
            http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(body));
            }).on('error', reject);
        });

        const targets = JSON.parse(tabsResp);
        const chromeTabs = targets.filter((t: any) =>
            t.type === 'page' && t.url && t.url.includes('chrome://extensions')
        );

        console.log(`\n✓ chrome://extensions tabs found: ${chromeTabs.length}`);
        chromeTabs.forEach((t: any) => {
            console.log(`  - ${t.url}`);
        });

        console.log(`\n✓ Total page tabs: ${targets.filter((t: any) => t.type === 'page').length}`);

        ws.close();
        process.exit(0);
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        process.exit(1);
    });
}

reloadExtensionAndListen();
