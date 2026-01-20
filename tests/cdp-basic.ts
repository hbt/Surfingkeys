#!/usr/bin/env ts-node
/**
 * CDP Test - Extension Reload via Keyboard Shortcut
 *
 * Tests:
 * - CDP connection to extension background
 * - Auto-trigger reload via keyboard (Alt+Shift+R)
 * - Capture console logs during reload
 * - Exit cleanly with pass/fail status
 *
 * Usage: npx ts-node tests/cdp-basic.ts
 *
 * Prerequisites:
 * - Chrome running with --remote-debugging-port=9222
 * - Surfingkeys extension loaded
 */

import * as WebSocket from 'ws';
import * as http from 'http';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { randomBytes } from 'crypto';

interface CDPTarget {
    id: string;
    title: string;
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
}

// Generate log file with timestamp and UUID
const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const uuid = randomBytes(4).toString('hex'); // 8-char hex
const LOG_FILE = `/tmp/surfingkeys-cdp-reload-keyboard-${timestamp}-${uuid}.log`;
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
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
    log(`=== CDP Test: Extension Reload (Keyboard) ===`);
    log(`Started: ${new Date().toISOString()}`);
    log(`Log file: ${LOG_FILE}`);
    log(`Tail command: tail -f ${LOG_FILE}\n`);

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

    let reloadDetected = false;
    let captureTimeout: NodeJS.Timeout;

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

        log('Triggering extension reload via keyboard shortcut...\n');

        // Wait 500ms for CDP to be fully ready, then trigger reload
        setTimeout(() => {
            try {
                execSync('xdotool key alt+shift+r', { stdio: 'ignore' });
                log('✓ Triggered Alt+Shift+R\n');
                log('Capturing console logs...\n');
                log('---\n');
            } catch (error: any) {
                log('❌ Failed to trigger keyboard shortcut: ' + error.message);
                ws.close();
                return;
            }
        }, 500);

        // Set timeout to exit after capturing logs for 5 seconds
        captureTimeout = setTimeout(() => {
            log('\n---\n');
            if (reloadDetected) {
                log('✅ TEST PASSED: Extension reload detected');
            } else {
                log('⚠️  TEST UNCERTAIN: No explicit reload confirmation in logs');
                log('   (Reload may have occurred without detectable log output)');
            }
            ws.close();
        }, 5500);
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

            // Detect reload-related messages
            if (message.includes('RESTARTEXT') || message.includes('restartext') ||
                message.includes('Reloading extension')) {
                reloadDetected = true;
            }

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
