#!/usr/bin/env ts-node
/**
 * CDP Error Viewer Live Demo v2
 *
 * Fixed: Fetch errors via background script first, then inject viewer with data
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { CDP_CONFIG } from './config/cdp-config';

let messageId = 1;

async function findTarget(type: string, urlOrTitle: string): Promise<string | null> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get(`${CDP_CONFIG.endpoint}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const target = targets.find((t: any) => {
        if (type === 'page') return t.type === 'page' && t.url.includes(urlOrTitle);
        if (type === 'extension') return t.url.includes('chrome-extension://');
        return false;
    });
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
                    console.log('CDP Error:', msg.error.message);
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
    console.log('Error Viewer Live Demo v2\n');

    // Step 1: Get errors from extension context (where chrome API is available)
    console.log('Step 1: Fetching errors from chrome.storage.local...');

    const extWsUrl = await findTarget('extension', 'chrome-extension://');
    let errors = [];

    if (extWsUrl) {
        const extWs = new WebSocket(extWsUrl);
        await new Promise((resolve, reject) => {
            extWs.on('open', resolve);
            extWs.on('error', reject);
        });

        extWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
        await new Promise(r => setTimeout(r, 500));

        errors = await exec(extWs, `
            new Promise(r => {
                chrome.storage.local.get(['surfingkeys_errors'], (result) => {
                    r(result.surfingkeys_errors || []);
                });
            })
        `);

        console.log(`✓ Found ${errors ? errors.length : 0} errors\n`);
        extWs.close();
    } else {
        console.log('⚠️  Extension context not found, using mock data\n');
        // Create mock errors for demo
        errors = [
            {
                type: 'window.onerror',
                message: 'Demo error: Something went wrong',
                context: 'content_script',
                timestamp: new Date().toISOString(),
                source: 'demo.js',
                lineno: 42,
                colno: 10,
                stack: 'Error: Something went wrong\n    at demo.js:42:10\n    at main.js:100:5',
                url: 'https://www.google.com'
            },
            {
                type: 'unhandledrejection',
                message: 'Demo rejection: Promise failed',
                context: 'background',
                timestamp: new Date(Date.now() - 60000).toISOString(),
                stack: 'Error: Promise failed\n    at async handler\n    at background.js:200:3',
                url: 'chrome-extension://...'
            }
        ];
    }

    // Step 2: Connect to page and inject viewer
    console.log('Step 2: Connecting to page...');
    const pageWsUrl = await findTarget('page', 'www.google.com');
    if (!pageWsUrl) {
        console.log('❌ Could not find Google page');
        process.exit(1);
    }

    const pageWs = new WebSocket(pageWsUrl);
    await new Promise((resolve, reject) => {
        pageWs.on('open', resolve);
        pageWs.on('error', reject);
    });

    pageWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 500));

    console.log('✓ Connected to page\n');

    // Step 3: Inject viewer with embedded error data
    console.log('Step 3: Injecting error viewer UI...');

    const viewerCode = `
(function() {
    const errors = ${JSON.stringify(errors)};

    const existing = document.getElementById('sk-error-viewer');
    if (existing) existing.remove();

    const viewer = document.createElement('div');
    viewer.id = 'sk-error-viewer';
    viewer.innerHTML = '
        <style>
            #sk-error-viewer {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.98);
                z-index: 999999;
                color: #0f0;
                font-family: Monaco, monospace;
                font-size: 13px;
                overflow: auto;
                padding: 20px;
            }
            .sk-header {
                font-size: 24px;
                color: #0f0;
                border-bottom: 2px solid #0f0;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .sk-btn {
                background: #222;
                border: 1px solid #0f0;
                color: #0f0;
                padding: 8px 16px;
                cursor: pointer;
                margin-right: 10px;
                font-family: inherit;
            }
            .sk-btn:hover {
                background: #0f0;
                color: #000;
            }
            .sk-error {
                background: #111;
                border: 1px solid #333;
                padding: 15px;
                margin: 10px 0;
                cursor: pointer;
            }
            .sk-error:hover {
                border-color: #0f0;
            }
            .sk-error-type {
                color: #f00;
                font-weight: bold;
            }
            .sk-error-msg {
                color: #ff6;
                margin: 5px 0;
            }
            .sk-error-meta {
                color: #666;
                font-size: 11px;
            }
            .sk-error-details {
                display: none;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid #333;
            }
            .sk-error.expanded .sk-error-details {
                display: block;
            }
            .sk-stack {
                background: #000;
                padding: 10px;
                margin: 10px 0;
                overflow-x: auto;
                color: #0f0;
                font-size: 11px;
            }
        </style>

        <div class="sk-header">
            🔍 Surfingkeys Error Viewer - ${errors.length} errors
        </div>

        <div style="margin-bottom: 20px;">
            <button class="sk-btn" onclick="document.getElementById('sk-error-viewer').remove()">✕ Close</button>
            <button class="sk-btn" onclick="alert('Export feature - would download JSON file')">📥 Export</button>
        </div>

        <div id="sk-error-list">
            ' + (errors.length === 0 ? '<div style="text-align:center;color:#666;padding:40px;">No errors captured</div>' : '') + '
        </div>
    ';

    document.body.appendChild(viewer);

    // Render errors
    const list = document.getElementById('sk-error-list');
    errors.forEach((err, idx) => {
        const div = document.createElement('div');
        div.className = 'sk-error';
        div.innerHTML = '<div class="sk-error-type">[' + err.type + ']</div>' +
            '<div class="sk-error-msg">' + err.message + '</div>' +
            '<div class="sk-error-meta">' +
                err.context + ' | ' + new Date(err.timestamp).toLocaleString() +
                (err.source ? ' | ' + err.source + ':' + err.lineno : '') +
            '</div>' +
            '<div class="sk-error-details">' +
                '<div><strong>Timestamp:</strong> ' + err.timestamp + '</div>' +
                '<div><strong>Context:</strong> ' + err.context + '</div>' +
                (err.url ? '<div><strong>URL:</strong> ' + err.url + '</div>' : '') +
                (err.stack ? '<div><strong>Stack:</strong></div><pre class="sk-stack">' + err.stack + '</pre>' : '') +
            '</div>';
        div.onclick = () => div.classList.toggle('expanded');
        list.appendChild(div);
    });

    return 'Viewer injected with ' + errors.length + ' errors';
})();
    `;

    const result = await exec(pageWs, viewerCode);
    console.log('✓', result);

    console.log('\n✅ ERROR VIEWER IS NOW VISIBLE IN YOUR BROWSER!\n');
    console.log('Features:');
    console.log('  • Click any error to expand full details');
    console.log('  • Green terminal-style UI');
    console.log('  • Stack traces shown when expanded');
    console.log('  • Click "✕ Close" to dismiss\n');

    pageWs.close();
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
