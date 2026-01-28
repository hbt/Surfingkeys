/**
 * Quick debug script to test openSession functionality
 */

import WebSocket from 'ws';
import * as http from 'http';

const CDP_PORT = 9222;

async function getCDPTargets() {
    return new Promise<any[]>((resolve, reject) => {
        http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });
}

async function connectToTarget(wsUrl: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

let msgId = 1;
async function evalInTarget(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (data: any) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                ws.removeListener('message', handler);
                if (msg.error) reject(new Error(msg.error.message));
                else resolve(msg.result?.result?.value);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression: code, returnByValue: true, awaitPromise: true }
        }));
    });
}

async function main() {
    console.log('Finding background target...');
    const targets = await getCDPTargets();
    const bgTarget = targets.find(t => t.title === 'Surfingkeys' || t.type === 'service_worker');

    if (!bgTarget) {
        console.error('Background target not found!');
        process.exit(1);
    }

    console.log(`Connecting to: ${bgTarget.title}`);
    const ws = await connectToTarget(bgTarget.webSocketDebuggerUrl);

    console.log('\n1. Creating test session in storage...');
    await evalInTarget(ws, `
        new Promise((resolve) => {
            chrome.storage.local.set({
                sessions: {
                    'test-debug': {
                        tabs: [['http://127.0.0.1:9873/scroll-test.html', 'http://127.0.0.1:9873/visual-test.html']]
                    }
                }
            }, () => {
                console.log('Session created in storage');
                resolve(true);
            });
        })
    `);

    console.log('\n2. Verifying session was saved...');
    const savedSession = await evalInTarget(ws, `
        new Promise((resolve) => {
            chrome.storage.local.get('sessions', (data) => {
                resolve(data.sessions['test-debug']);
            });
        })
    `);
    console.log('Saved session:', JSON.stringify(savedSession, null, 2));

    console.log('\n3. Getting initial tabs...');
    const initialTabs = await evalInTarget(ws, `
        new Promise((resolve) => {
            chrome.tabs.query({currentWindow: true}, (tabs) => {
                resolve(tabs.map(t => ({id: t.id, url: t.url})));
            });
        })
    `);
    console.log(`Initial tabs (${initialTabs.length}):`, initialTabs);

    console.log('\n4. Calling openSession...');
    await evalInTarget(ws, `
        new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'openSession',
                name: 'test-debug'
            }, (response) => {
                console.log('openSession response:', response);
                resolve(true);
            });
        })
    `);

    console.log('\n5. Waiting for tabs to be created...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n6. Getting final tabs...');
    const finalTabs = await evalInTarget(ws, `
        new Promise((resolve) => {
            chrome.tabs.query({currentWindow: true}, (tabs) => {
                resolve(tabs.map(t => ({id: t.id, url: t.url})));
            });
        })
    `);
    console.log(`Final tabs (${finalTabs.length}):`, finalTabs);

    ws.close();
    console.log('\nDone!');
}

main().catch(console.error);
