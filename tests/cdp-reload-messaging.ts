#!/usr/bin/env ts-node
/**
 * CDP Test - Extension Reload via CDP Messaging
 *
 * Tests:
 * - CDP connection to extension background
 * - Send reload command via CDP Runtime.evaluate
 * - Verify extension reloads by checking "uptime"
 * - Exit cleanly with pass/fail status
 *
 * Usage: npx ts-node tests/cdp-reload-messaging.ts
 *
 * Prerequisites:
 * - Chrome running with --remote-debugging-port=9222
 * - Surfingkeys extension loaded
 */

import * as WebSocket from 'ws';
import * as http from 'http';
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
const LOG_FILE = `/tmp/surfingkeys-cdp-reload-messaging-${timestamp}-${uuid}.log`;
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
    log(`=== CDP Test: Extension Reload (Messaging) ===`);
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

    let messageId = 1;
    let startTimeBeforeReload: number | null = null;
    let reloadTriggered = false;

    ws.on('open', async () => {
        log('✓ Connected to background page\n');

        // Enable Runtime domain
        ws.send(JSON.stringify({
            id: messageId++,
            method: 'Runtime.enable'
        }));

        // Enable Log domain for console messages
        ws.send(JSON.stringify({
            id: messageId++,
            method: 'Log.enable'
        }));

        log('Setting up extension start time tracker...\n');

        // Inject start time tracker
        ws.send(JSON.stringify({
            id: messageId++,
            method: 'Runtime.evaluate',
            params: {
                expression: `
                    if (!globalThis.__extensionStartTime) {
                        globalThis.__extensionStartTime = Date.now();
                    }
                    globalThis.__extensionStartTime;
                `,
                returnByValue: true
            }
        }));

        // Wait for tracker to be set, then trigger reload
        setTimeout(() => {
            log('Triggering extension reload by calling handler directly...\n');

            // Call the cdpReloadExtension handler directly
            ws.send(JSON.stringify({
                id: messageId++,
                method: 'Runtime.evaluate',
                params: {
                    expression: `
                        console.log('[CDP-TEST] Calling cdpReloadExtension handler');
                        if (typeof self !== 'undefined' && self.cdpReloadExtension) {
                            console.log('[CDP-TEST] Handler found, calling it');
                            // Create a mock message and sendResponse
                            const mockMessage = {
                                action: 'cdpReloadExtension',
                                needResponse: true
                            };
                            const mockSender = {};
                            const mockSendResponse = (response) => {
                                console.log('[CDP-TEST] Response:', JSON.stringify(response));
                            };
                            self.cdpReloadExtension(mockMessage, mockSender, mockSendResponse);
                        } else {
                            console.error('[CDP-TEST] Handler not found!');
                        }
                    `,
                    returnByValue: true,
                    awaitPromise: false
                }
            }));

            reloadTriggered = true;
            startTimeBeforeReload = Date.now();

            log('✓ Reload trigger sent\n');
            log('Waiting for extension to reload...\n');
        }, 1000);
    });

    ws.on('message', (data: WebSocket.Data) => {
        const msg = JSON.parse(data.toString());

        // Handle Runtime.evaluate responses
        if (msg.id && msg.result) {
            // Check if this is the start time response
            if (msg.result.result && typeof msg.result.result.value === 'number') {
                const extensionStartTime = msg.result.result.value;

                if (reloadTriggered && startTimeBeforeReload) {
                    const timeSinceReload = Date.now() - startTimeBeforeReload;

                    log(`Extension start time: ${new Date(extensionStartTime).toISOString()}`);
                    log(`Reload triggered at: ${new Date(startTimeBeforeReload).toISOString()}`);
                    log(`Time since reload command: ${timeSinceReload}ms\n`);

                    if (extensionStartTime > startTimeBeforeReload) {
                        const uptime = Date.now() - extensionStartTime;
                        log(`Extension uptime: ${uptime}ms (fresh restart confirmed!)\n`);
                        log('---\n');
                        log('✅ TEST PASSED: Extension reloaded via CDP messaging');
                        log(`   - Reload command sent successfully`);
                        log(`   - Extension restarted with fresh uptime (${uptime}ms)`);
                        log(`   - Uptime verification: ${extensionStartTime} > ${startTimeBeforeReload}`);
                        ws.close();
                    }
                }
            }
        }

        // Console API called
        if (msg.method === 'Runtime.consoleAPICalled') {
            const params = msg.params;
            const type = params.type;
            const args = params.args || [];

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

    ws.on('close', async () => {
        if (!reloadTriggered) {
            log('\n✓ Connection closed before reload');
            if (logStream) logStream.end();
            process.exit(0);
        }

        log('Connection closed (extension reloading)...\n');
        log('Waiting 3 seconds for extension to restart...\n');

        // Wait for extension to reload
        await new Promise(resolve => setTimeout(resolve, 3000));

        log('Reconnecting to verify reload...\n');

        try {
            // Find background page again (new instance after reload)
            const newWsUrl = await findExtensionBackground();
            const newWs = new WebSocket(newWsUrl);

            newWs.on('open', () => {
                log('✓ Reconnected to reloaded extension\n');

                // Enable Runtime domain
                newWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Runtime.enable'
                }));

                // Get the new start time
                newWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `
                            if (!globalThis.__extensionStartTime) {
                                globalThis.__extensionStartTime = Date.now();
                            }
                            globalThis.__extensionStartTime;
                        `,
                        returnByValue: true
                    }
                }));
            });

            newWs.on('message', (data: WebSocket.Data) => {
                const msg = JSON.parse(data.toString());

                // Forward to main handler for processing
                ws.emit('message', data);
            });

            newWs.on('error', (error) => {
                log('❌ Reconnection error: ' + error.message);
                log('\n---\n');
                log('❌ TEST FAILED: Could not reconnect after reload');
                if (logStream) logStream.end();
                process.exit(1);
            });

            // Timeout if verification takes too long
            setTimeout(() => {
                log('\n---\n');
                log('❌ TEST FAILED: Timeout waiting for uptime verification');
                newWs.close();
                if (logStream) logStream.end();
                process.exit(1);
            }, 5000);

        } catch (error: any) {
            log('❌ Failed to reconnect: ' + error.message);
            log('\n---\n');
            log('❌ TEST FAILED: Extension did not reload properly');
            if (logStream) logStream.end();
            process.exit(1);
        }
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
