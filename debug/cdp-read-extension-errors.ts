#!/usr/bin/env ts-node
/**
 * Read Extension Errors
 *
 * Reads errors from both:
 * 1. Chrome's extension error log (chrome://extensions)
 * 2. Our error storage (chrome.storage.local)
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

async function findTarget(pattern: string): Promise<string | null> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const target = targets.find((t: any) => t.url && t.url.includes(pattern));
    return target ? target.webSocketDebuggerUrl : null;
}

function exec(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

        const handler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) {
                    reject(new Error(msg.error.message));
                } else {
                    resolve(msg.result?.result?.value);
                }
            }
        };

        ws.on('message', handler);
        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression: code,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
}

async function main() {
    console.log('Reading Extension Errors\n');

    // Find extension page (frontend.html usually has chrome API access)
    console.log('Step 1: Connecting to extension context...');
    const extWsUrl = await findTarget('chrome-extension://');
    if (!extWsUrl) {
        console.log('❌ Extension context not found');
        process.exit(1);
    }

    const extWs = new WebSocket(extWsUrl);
    await new Promise((resolve, reject) => {
        extWs.on('open', resolve);
        extWs.on('error', reject);
    });

    extWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 500));
    console.log('✓ Connected\n');

    // Read from chrome.storage.local
    console.log('Step 2: Reading errors from chrome.storage.local...');
    const storedErrors = await exec(extWs, `
        new Promise(r => {
            chrome.storage.local.get(['surfingkeys_errors'], (result) => {
                r(result.surfingkeys_errors || []);
            });
        })
    `);

    console.log(`Found ${storedErrors ? storedErrors.length : 0} errors in storage\n`);

    if (storedErrors && storedErrors.length > 0) {
        console.log('='.repeat(70));
        console.log('STORED ERRORS (from chrome.storage.local)');
        console.log('='.repeat(70));

        storedErrors.forEach((err: any, idx: number) => {
            console.log(`\n[${idx + 1}] ${err.type}`);
            console.log(`    Message: ${err.message}`);
            console.log(`    Context: ${err.context}`);
            console.log(`    Time: ${err.timestamp}`);
            if (err.source) {
                console.log(`    Location: ${err.source}:${err.lineno}:${err.colno}`);
            }
            if (err.stack) {
                const stackLines = err.stack.split('\n').slice(0, 3);
                console.log(`    Stack: ${stackLines.join('\n           ')}`);
            }
        });
        console.log();
    }

    // Try to get Chrome's extension errors via devtools protocol
    console.log('Step 3: Checking for console errors...');

    // Get recent console errors
    const consoleErrors = await exec(extWs, `
        // Check if there are any errors in window._surfingkeysErrors
        window._surfingkeysErrors || []
    `);

    if (consoleErrors && consoleErrors.length > 0) {
        console.log(`Found ${consoleErrors.length} errors in memory\n`);
        console.log('='.repeat(70));
        console.log('IN-MEMORY ERRORS (from window._surfingkeysErrors)');
        console.log('='.repeat(70));

        consoleErrors.forEach((err: any, idx: number) => {
            console.log(`\n[${idx + 1}] ${err.type}`);
            console.log(`    Message: ${err.message}`);
            console.log(`    Context: ${err.context}`);
        });
        console.log();
    }

    // Check if error handlers are installed
    console.log('Step 4: Verifying error handler installation...');
    const handlersInstalled = await exec(extWs, `
        typeof window._surfingkeysErrorHandlersInstalled !== 'undefined' &&
        window._surfingkeysErrorHandlersInstalled
    `);

    console.log(`Error handlers installed: ${handlersInstalled ? '✓ YES' : '✗ NO'}\n`);

    extWs.close();

    console.log('='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Stored errors: ${storedErrors ? storedErrors.length : 0}`);
    console.log(`In-memory errors: ${consoleErrors ? consoleErrors.length : 0}`);
    console.log(`Handlers installed: ${handlersInstalled ? 'YES' : 'NO'}`);
    console.log();
    console.log('To view in browser: chrome-extension://<id>/pages/error-viewer.html');
    console.log();
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
