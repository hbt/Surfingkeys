#!/usr/bin/env ts-node
/**
 * Minimal CDP Test - Connect to extension and capture console logs
 *
 * Usage: npx ts-node tests/cdp-basic.ts
 *
 * Prerequisites:
 * - Chrome running with --remote-debugging-port=9222
 * - Surfingkeys extension loaded
 */

import * as WebSocket from 'ws';
import * as http from 'http';

interface CDPTarget {
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
}

async function checkCDPAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:9222/json', (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function findExtensionBackground(): Promise<string> {
    // Fetch targets from CDP
    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });

    const targets: CDPTarget[] = JSON.parse(data);

    // Find Surfingkeys background service worker
    const bg = targets.find(t =>
        t.title === 'Surfingkeys' ||
        t.url.includes('_generated_background_page.html') ||
        (t.type === 'service_worker' && t.url.includes('background.js'))
    );

    if (!bg) {
        console.error('❌ Surfingkeys background page not found');
        console.log('Available targets:', targets.map(t => ({ title: t.title, type: t.type, url: t.url })));
        process.exit(1);
    }

    console.log(`✓ Found background: ${bg.title} (${bg.type})`);
    return bg.webSocketDebuggerUrl;
}

async function main() {
    console.log('CDP Basic Test - Console Log Capture\n');

    // Check if CDP is available
    const cdpAvailable = await checkCDPAvailable();
    if (!cdpAvailable) {
        console.error('❌ Chrome DevTools Protocol not available on port 9222\n');
        console.log('Please launch Chrome with remote debugging enabled:\n');
        console.log('  /home/hassen/config/scripts/private/bin/gchrb-dev\n');
        console.log('Or manually:');
        console.log('  google-chrome-stable --remote-debugging-port=9222\n');
        process.exit(1);
    }

    // Find background page
    const wsUrl = await findExtensionBackground();

    // Connect
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log('✓ Connected to background page\n');

        // Enable Runtime domain to receive console messages
        ws.send(JSON.stringify({
            id: 1,
            method: 'Runtime.enable'
        }));

        // Enable Log domain
        ws.send(JSON.stringify({
            id: 2,
            method: 'Log.enable'
        }));

        console.log('Listening for console messages...\n');
        console.log('Press Alt+Shift+R or run: ./scripts/reload-extension.sh\n');
        console.log('---\n');
    });

    ws.on('message', (data: WebSocket.Data) => {
        const msg = JSON.parse(data.toString());

        // Console API called (console.log, console.error, etc.)
        if (msg.method === 'Runtime.consoleAPICalled') {
            const params = msg.params;
            const type = params.type; // 'log', 'error', 'warn', etc.
            const args = params.args || [];

            // Extract text from arguments
            const texts = args.map((arg: any) => {
                if (arg.type === 'string') {
                    return arg.value;
                } else if (arg.value !== undefined) {
                    return String(arg.value);
                } else if (arg.description) {
                    return arg.description;
                } else {
                    return JSON.stringify(arg);
                }
            });

            const message = texts.join(' ');

            // Color output based on type
            const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️ ' : '💬';
            console.log(`${prefix} [${type.toUpperCase()}] ${message}`);
        }

        // Exception thrown
        else if (msg.method === 'Runtime.exceptionThrown') {
            const exception = msg.params.exceptionDetails;
            const errorMsg = exception.text || exception.exception?.description || 'Unknown error';
            const lineNumber = exception.lineNumber;
            const url = exception.url;

            console.log(`❌ [EXCEPTION] ${errorMsg}`);
            if (url) {
                console.log(`   at ${url}:${lineNumber}`);
            }
        }

        // Log entries
        else if (msg.method === 'Log.entryAdded') {
            const entry = msg.params.entry;
            console.log(`📝 [LOG] ${entry.text}`);
        }
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
    });

    ws.on('close', () => {
        console.log('\n✓ Connection closed');
        process.exit(0);
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
