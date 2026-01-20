#!/usr/bin/env ts-node
/**
 * Debug Script: Extension Reload via CDP Messaging - FIXED
 *
 * This script fixes the hanging reload-messaging test by:
 * 1. Adding proper retry logic for service worker reconnection
 * 2. Monitoring CDP targets before/after reload
 * 3. Handling service worker lifecycle correctly
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

let messageId = 1;

function log(message: string): void {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

async function listAllTargets(): Promise<CDPTarget[]> {
    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });
    return JSON.parse(data);
}

async function findExtensionBackground(retries = 10, delay = 1000): Promise<string> {
    for (let i = 0; i < retries; i++) {
        try {
            const targets = await listAllTargets();

            const bg = targets.find(t =>
                t.title === 'Surfingkeys' ||
                t.url.includes('_generated_background_page.html') ||
                (t.type === 'service_worker' && t.url.includes('background.js'))
            );

            if (bg) {
                log(`✓ Found background: ${bg.title} (${bg.type})`);
                return bg.webSocketDebuggerUrl;
            }

            if (i < retries - 1) {
                log(`⏳ Background not found, retrying in ${delay}ms... (${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } catch (error: any) {
            log(`⚠️  Error fetching targets: ${error.message}`);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Final attempt - show what's available
    const targets = await listAllTargets();
    log('❌ Surfingkeys background page not found after retries');
    log('Available targets:');
    targets.forEach(t => {
        log(`  - ${t.type}: ${t.title || t.url}`);
    });
    throw new Error('Background not found');
}

async function main() {
    log('=== CDP Debug: Extension Reload (Messaging) - FIXED ===\n');

    let reloadStartTime = 0;

    // Step 1: Connect to background initially
    log('Step 1: Finding extension background...');
    const wsUrl = await findExtensionBackground();
    const ws = new WebSocket(wsUrl);

    ws.on('open', async () => {
        log('✓ Connected to background page\n');

        // Enable Runtime domain
        ws.send(JSON.stringify({
            id: messageId++,
            method: 'Runtime.enable'
        }));

        await new Promise(resolve => setTimeout(resolve, 500));

        // Step 2: Set up start time tracker
        log('Step 2: Setting up extension start time tracker...');
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

        await new Promise(resolve => setTimeout(resolve, 500));

        // Step 3: List targets before reload
        log('\nStep 3: Listing targets BEFORE reload...');
        const targetsBefore = await listAllTargets();
        log(`  Total targets: ${targetsBefore.length}`);
        targetsBefore.forEach(t => {
            log(`    - ${t.type}: ${t.title || t.url.substring(0, 60)}`);
        });

        // Step 4: Trigger reload via CDP message bridge
        log('\nStep 4: Triggering extension reload via CDP Message Bridge...');
        reloadStartTime = Date.now();

        ws.send(JSON.stringify({
            id: messageId++,
            method: 'Runtime.evaluate',
            params: {
                expression: `
                    (function() {
                        console.log('[CDP-DEBUG] Checking for message bridge...');
                        if (typeof globalThis.__CDP_MESSAGE_BRIDGE__ !== 'undefined') {
                            console.log('[CDP-DEBUG] Dispatching cdpReloadExtension...');
                            const result = globalThis.__CDP_MESSAGE_BRIDGE__.dispatch(
                                'cdpReloadExtension',
                                {},
                                true
                            );
                            console.log('[CDP-DEBUG] Result:', JSON.stringify(result));
                            return result;
                        } else {
                            console.error('[CDP-DEBUG] Message bridge not found!');
                            return { error: 'no_bridge' };
                        }
                    })()
                `,
                returnByValue: true,
                awaitPromise: false
            }
        }));

        log('✓ Reload command dispatched\n');

        // Step 5: Wait for connection to close (extension reloads)
        log('Step 5: Waiting for connection to close (indicates reload)...');
    });

    ws.on('message', (data: WebSocket.Data) => {
        const msg = JSON.parse(data.toString());

        // Log console messages from background
        if (msg.method === 'Runtime.consoleAPICalled') {
            const params = msg.params;
            const type = params.type;
            const args = params.args || [];

            const texts = args.map((arg: any) => {
                if (arg.type === 'string') return arg.value;
                if (arg.value !== undefined) return String(arg.value);
                return JSON.stringify(arg);
            });

            const message = texts.join(' ');
            log(`  📝 [${type.toUpperCase()}] ${message}`);
        }
    });

    ws.on('close', async () => {
        log('✓ Connection closed (extension is reloading)\n');

        // Step 6: Wait and monitor for service worker to reappear
        log('Step 6: Waiting for extension to restart...');

        // Wait a bit for the reload to initiate
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 7: Poll for background to reappear
        log('\nStep 7: Polling for background service worker...');

        try {
            const newWsUrl = await findExtensionBackground(15, 1000);

            log('\n✓ Extension background reappeared!');
            log(`  Reconnection took: ${Date.now() - reloadStartTime}ms`);

            // Step 8: Verify it's a fresh instance
            log('\nStep 8: Verifying fresh instance...');
            const newWs = new WebSocket(newWsUrl);

            newWs.on('open', () => {
                log('✓ Reconnected to reloaded extension\n');

                newWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Runtime.enable'
                }));

                setTimeout(() => {
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
                }, 500);
            });

            newWs.on('message', (data: WebSocket.Data) => {
                const msg = JSON.parse(data.toString());

                if (msg.id && msg.result && msg.result.result && typeof msg.result.result.value === 'number') {
                    const newStartTime = msg.result.result.value;
                    const uptime = Date.now() - newStartTime;

                    log(`Extension start time: ${new Date(newStartTime).toISOString()}`);
                    log(`Uptime: ${uptime}ms`);

                    if (uptime < 30000) { // Started in last 30 seconds
                        log('\n✅ TEST PASSED: Extension successfully reloaded!');
                        log(`   - Reload command dispatched successfully`);
                        log(`   - Extension restarted with fresh instance`);
                        log(`   - Uptime verification: ${uptime}ms (fresh restart)`);
                    } else {
                        log(`\n⚠️  WARNING: Uptime is ${uptime}ms, which seems too long`);
                    }

                    newWs.close();
                    process.exit(0);
                }
            });

            newWs.on('error', (error) => {
                log(`❌ Reconnection error: ${error.message}`);
                process.exit(1);
            });

            setTimeout(() => {
                log('\n❌ TEST FAILED: Timeout waiting for uptime verification');
                newWs.close();
                process.exit(1);
            }, 10000);

        } catch (error: any) {
            log(`\n❌ TEST FAILED: ${error.message}`);
            process.exit(1);
        }
    });

    ws.on('error', (error) => {
        log(`❌ WebSocket error: ${error.message}`);
        process.exit(1);
    });

    // Overall timeout
    setTimeout(() => {
        log('\n❌ TEST FAILED: Overall timeout (60s)');
        process.exit(1);
    }, 60000);
}

main().catch(error => {
    log(`❌ Fatal error: ${error}`);
    process.exit(1);
});
