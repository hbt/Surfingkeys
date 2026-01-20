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
import * as fs from 'fs';

interface CDPTarget {
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
}

const LOG_FILE = '/tmp/surfingkeys-cdp.log';
let logStream: fs.WriteStream;

function log(message: string): void {
    console.log(message);
    if (logStream) {
        logStream.write(message + '\n');
    }
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
        log('❌ Surfingkeys background page not found');
        log('Available targets: ' + JSON.stringify(targets.map(t => ({ title: t.title, type: t.type, url: t.url })), null, 2));
        if (logStream) logStream.end();
        process.exit(1);
    }

    log(`✓ Found background: ${bg.title} (${bg.type})`);
    return bg.webSocketDebuggerUrl;
}

async function main() {
    // Initialize log file
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    log(`\n=== CDP Test Started: ${new Date().toISOString()} ===\n`);
    log('CDP Basic Test - Console Log Capture\n');

    // Check if CDP is available
    const cdpAvailable = await checkCDPAvailable();
    if (!cdpAvailable) {
        log('❌ Chrome DevTools Protocol not available on port 9222\n');
        log('Please launch Chrome with remote debugging enabled:\n');
        log('  /home/hassen/config/scripts/private/bin/gchrb-dev\n');
        log('Or manually:');
        log('  google-chrome-stable --remote-debugging-port=9222\n');
        logStream.end();
        process.exit(1);
    }

    // Find background page
    const wsUrl = await findExtensionBackground();

    // Connect
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        log('✓ Connected to background page\n');

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

        log('Listening for console messages...\n');
        log('Press Alt+Shift+R or run: ./scripts/reload-extension.sh\n');
        log(`Logs: tail -f ${LOG_FILE}\n`);
        log('---\n');
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
            log(`${prefix} [${type.toUpperCase()}] ${message}`);
        }

        // Exception thrown
        else if (msg.method === 'Runtime.exceptionThrown') {
            const exception = msg.params.exceptionDetails;
            const errorMsg = exception.text || exception.exception?.description || 'Unknown error';
            const lineNumber = exception.lineNumber;
            const url = exception.url;

            log(`❌ [EXCEPTION] ${errorMsg}`);
            if (url) {
                log(`   at ${url}:${lineNumber}`);
            }
        }

        // Log entries
        else if (msg.method === 'Log.entryAdded') {
            const entry = msg.params.entry;
            log(`📝 [LOG] ${entry.text}`);
        }
    });

    ws.on('error', (error) => {
        log('❌ WebSocket error: ' + error.message);
    });

    ws.on('close', () => {
        log('\n✓ Connection closed');
        if (logStream) {
            logStream.end();
        }
        process.exit(0);
    });

    // Handle process termination
    process.on('SIGINT', () => {
        log('\n\n✓ Test terminated by user');
        if (logStream) {
            logStream.end();
        }
        process.exit(0);
    });
}

main().catch(error => {
    log('❌ Fatal error: ' + error);
    if (logStream) {
        logStream.end();
    }
    process.exit(1);
});
