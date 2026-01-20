#!/usr/bin/env ts-node
/**
 * CDP Simple State Inspector
 *
 * Shows what we CAN detect about Surfingkeys state through behavioral testing
 */

import * as WebSocket from 'ws';
import * as http from 'http';

let messageId = 1;

async function findBg(): Promise<string> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const bg = targets.find((t: any) => t.title === 'Surfingkeys' || t.url.includes('background.js'));
    if (!bg) throw new Error('Background not found');
    return bg.webSocketDebuggerUrl;
}

function exec(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                resolve(msg.error ? null : msg.result?.result?.value);
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
    console.log('\n🔍 Current State Inspector (Simple)\n');
    console.log('='.repeat(60));

    const bgWs = new WebSocket(await findBg());

    bgWs.on('open', async () => {
        bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
        await new Promise(r => setTimeout(r, 100));

        // Get active tab
        const tab = await exec(bgWs, `
            new Promise(r => {
                chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                    r(tabs[0] ? { id: tabs[0].id, url: tabs[0].url, title: tabs[0].title } : null);
                });
            })
        `);

        if (!tab) {
            console.log('No active tab');
            bgWs.close();
            return;
        }

        console.log('\n📍 CURRENT TAB');
        console.log('   Title:', tab.title);
        console.log('   URL:  ', tab.url);

        // Try to execute in tab
        const tabResult = await exec(bgWs, `
            new Promise(r => {
                chrome.tabs.executeScript(${tab.id}, {
                    code: \`({
                        activeElement: document.activeElement?.tagName,
                        isEditable: document.activeElement && (
                            document.activeElement.tagName === 'INPUT' ||
                            document.activeElement.tagName === 'TEXTAREA' ||
                            document.activeElement.isContentEditable
                        ),
                        scrollY: window.scrollY,
                        pageHeight: document.documentElement.scrollHeight
                    })\`
                }, results => {
                    r(chrome.runtime.lastError ? null : results[0]);
                });
            })
        `);

        console.log('\n🎯 PAGE STATE');
        if (tabResult) {
            console.log('   Active Element: ', tabResult.activeElement || 'BODY');
            console.log('   Is Editable:    ', tabResult.isEditable ? 'YES' : 'NO');
            console.log('   Scroll Position:', tabResult.scrollY, 'px');
            console.log('   Page Height:    ', tabResult.pageHeight, 'px');

            console.log('\n💡 INFERRED MODE');
            if (tabResult.isEditable) {
                console.log('   Likely in: INSERT mode (focused on editable element)');
            } else {
                console.log('   Likely in: NORMAL mode (no editable element focused)');
            }
        } else {
            console.log('   Cannot execute on this page (protected page)');
        }

        console.log('\n' + '='.repeat(60));
        console.log('\n✅ This is what CDP can show you:');
        console.log('   • Current tab and URL');
        console.log('   • What element has focus');
        console.log('   • Whether it\'s editable (Insert mode indicator)');
        console.log('   • Scroll position');
        console.log('   • Inferred mode based on element focus\n');

        bgWs.close();
    });

    bgWs.on('close', () => process.exit(0));
    bgWs.on('error', (e) => {
        console.error('Error:', e.message);
        process.exit(1);
    });
}

main();
