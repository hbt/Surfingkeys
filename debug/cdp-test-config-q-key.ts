#!/usr/bin/env ts-node
/**
 * Test config loading: Does 'q' key (from config file) work?
 *
 * If 'q' works: Config is loaded ✅
 * If 'q' doesn't work: Config is NOT loaded ❌
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

            // Create two tabs
            console.log('Creating tabs...');
            await sendCommand(bgWs, 'Runtime.evaluate', {
                expression: `chrome.tabs.create({url: 'http://127.0.0.1:9873/', active: false}, () => {})`,
                returnByValue: true
            });
            await new Promise(r => setTimeout(r, 500));

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

                    // Get initial tab
                    const initialTab = await sendCommand(bgWs, 'Runtime.evaluate', {
                        expression: `new Promise(r => chrome.tabs.query({active: true, currentWindow: true}, t => r(t[0].id)))`,
                        returnByValue: true,
                        awaitPromise: true
                    });
                    console.log(`\nInitial active tab: ${initialTab.result.value}`);

                    // Send 'q' key (from config file)
                    console.log('\nSending "q" key (mapped in config file)...');
                    await sendCommand(pageWs, 'Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        key: 'q'
                    });
                    await sendCommand(pageWs, 'Input.dispatchKeyEvent', {
                        type: 'char',
                        text: 'q'
                    });
                    await sendCommand(pageWs, 'Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        key: 'q'
                    });
                    console.log('✓ "q" key sent');

                    // Get final tab
                    const finalTab = await sendCommand(bgWs, 'Runtime.evaluate', {
                        expression: `new Promise(r => chrome.tabs.query({active: true, currentWindow: true}, t => r(t[0].id)))`,
                        returnByValue: true,
                        awaitPromise: true
                    });
                    console.log(`Final active tab: ${finalTab.result.value}`);

                    // Result
                    console.log('\n' + '='.repeat(50));
                    if (initialTab.result.value !== finalTab.result.value) {
                        console.log('✅ CONFIG LOADED - "q" key works!');
                    } else {
                        console.log('❌ CONFIG NOT LOADED - "q" key does not work');
                    }
                    console.log('='.repeat(50));

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
