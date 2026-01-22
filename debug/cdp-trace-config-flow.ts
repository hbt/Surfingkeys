#!/usr/bin/env ts-node
/**
 * Trace config file flow through the system
 *
 * Shows:
 * 1. Is config path set in storage?
 * 2. Are snippets cached?
 * 3. Are userScripts registered with the code?
 * 4. Is config being injected into pages?
 * 5. Does content script see the config?
 */

import * as WebSocket from 'ws';
import * as http from 'http';

let messageId = 1;

async function fetchJson(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:9222${path}`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });
}

function sendCommand(ws: WebSocket, method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

        const handler = (data: any) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) reject(new Error(msg.error.message));
                else resolve(msg.result);
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function main() {
    const targets = await fetchJson('/json');
    const sw = targets.find((t: any) => t.type === 'service_worker' && t.url?.includes('background.js'));
    if (!sw) throw new Error('Service worker not found');

    const bgWs = new WebSocket(sw.webSocketDebuggerUrl);

    bgWs.on('open', async () => {
        try {
            await sendCommand(bgWs, 'Runtime.enable');

            console.log('\n' + '='.repeat(70));
            console.log('STEP 1: Check if localPath is set in chrome.storage.local');
            console.log('='.repeat(70));

            const storage1 = await sendCommand(bgWs, 'Runtime.evaluate', {
                expression: `new Promise(r => chrome.storage.local.get('localPath', d => r(d)))`,
                returnByValue: true,
                awaitPromise: true
            });
            console.log('localPath:', storage1.result.value);

            console.log('\n' + '='.repeat(70));
            console.log('STEP 2: Check if snippets are cached in storage');
            console.log('='.repeat(70));

            const storage2 = await sendCommand(bgWs, 'Runtime.evaluate', {
                expression: `new Promise(r => chrome.storage.local.get('snippets', d => {
                    const s = d.snippets;
                    r({
                        hasCached: !!s,
                        size: s ? s.length : 0,
                        lines: s ? s.split('\\n').length : 0,
                        firstLine: s ? s.split('\\n')[0].substring(0, 80) : 'N/A'
                    });
                }))`,
                returnByValue: true,
                awaitPromise: true
            });
            console.log('Snippets cached:', storage2.result.value);

            console.log('\n' + '='.repeat(70));
            console.log('STEP 3: Check registered userScripts');
            console.log('='.repeat(70));

            const scripts = await sendCommand(bgWs, 'Runtime.evaluate', {
                expression: `new Promise(r => chrome.userScripts.getScripts(undefined, s => {
                    r(s.map(x => ({
                        id: x.id,
                        matches: x.matches,
                        hasCode: x.js && x.js[0] && !!x.js[0].code,
                        codePreview: x.js && x.js[0] ? x.js[0].code.substring(0, 100) : 'N/A'
                    })));
                }))`,
                returnByValue: true,
                awaitPromise: true
            });
            console.log('UserScripts:', JSON.stringify(scripts.result.value, null, 2));

            console.log('\n' + '='.repeat(70));
            console.log('STEP 4: Check what getSettings returns from background');
            console.log('='.repeat(70));

            const settings = await sendCommand(bgWs, 'Runtime.evaluate', {
                expression: `new Promise(r => {
                    if (self.getSettings) {
                        self.getSettings({}, undefined, (response) => {
                            r({
                                hasSettings: !!response,
                                keys: response ? Object.keys(response).slice(0, 10) : [],
                                hasSnippets: response ? !!response.snippets : false,
                                snippetPreview: response && response.snippets ? response.snippets.substring(0, 100) : 'N/A'
                            });
                        });
                    } else {
                        r({ error: 'getSettings not found' });
                    }
                })`,
                returnByValue: true,
                awaitPromise: true
            });
            console.log('getSettings result:', JSON.stringify(settings.result.value, null, 2));

            console.log('\n' + '='.repeat(70));
            console.log('STEP 5: Create page and check if it receives config');
            console.log('='.repeat(70));

            await sendCommand(bgWs, 'Runtime.evaluate', {
                expression: `chrome.tabs.create({url: 'http://127.0.0.1:9873/hackernews.html', active: true}, () => {})`,
                returnByValue: true
            });
            await new Promise(r => setTimeout(r, 1000));

            const pageTargets = await fetchJson('/json');
            const page = pageTargets.find((t: any) => t.type === 'page' && t.url?.includes('127.0.0.1:9873/hackernews'));
            if (!page) throw new Error('Page not found');

            const pageWs = new WebSocket(page.webSocketDebuggerUrl);

            pageWs.on('open', async () => {
                try {
                    await sendCommand(pageWs, 'Runtime.enable');

                    const pageSettings = await sendCommand(pageWs, 'Runtime.evaluate', {
                        expression: `
                            (function() {
                                // Check if settings are in window
                                const hasSettings = !!window.settings;

                                // Try to get settings from runtime
                                return new Promise(r => {
                                    if (!window.settings) {
                                        // Try to request from background
                                        chrome.runtime.sendMessage({subject: 'getSettings'}, (response) => {
                                            r({
                                                windowSettings: false,
                                                runtimeSettings: !!response,
                                                keys: response ? Object.keys(response).slice(0, 10) : [],
                                                hasSnippets: response ? !!response.snippets : false
                                            });
                                        });
                                    } else {
                                        r({
                                            windowSettings: true,
                                            settings: Object.keys(window.settings).slice(0, 10)
                                        });
                                    }
                                });
                            })()
                        `,
                        returnByValue: true,
                        awaitPromise: true
                    });
                    console.log('Page received settings:', JSON.stringify(pageSettings.result.value, null, 2));

                    console.log('\n' + '='.repeat(70));
                    console.log('STEP 6: Check if "q" key is registered in content script');
                    console.log('='.repeat(70));

                    const keyCheck = await sendCommand(pageWs, 'Runtime.evaluate', {
                        expression: `
                            (function() {
                                // Check if Surfingkeys key handler exists
                                if (window.surfingkeys && window.surfingkeys.mappings) {
                                    const hasQ = window.surfingkeys.mappings.has('q');
                                    const hasE = window.surfingkeys.mappings.has('E');
                                    return { hasQ, hasE };
                                }
                                return { error: 'No surfingkeys object found' };
                            })()
                        `,
                        returnByValue: true,
                        awaitPromise: true
                    });
                    console.log('Key mappings in page:', JSON.stringify(keyCheck.result.value, null, 2));

                    pageWs.close();
                    bgWs.close();
                } catch (error: any) {
                    console.error('Page error:', error.message);
                    pageWs.close();
                    bgWs.close();
                    process.exit(1);
                }
            });
        } catch (error: any) {
            console.error('Error:', error.message);
            bgWs.close();
            process.exit(1);
        }
    });
}

main();
