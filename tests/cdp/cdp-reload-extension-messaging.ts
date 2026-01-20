#!/usr/bin/env ts-node
/**
 * CDP Test - Extension Reload via CDP Messaging (Simplified)
 *
 * Tests:
 * - CDP connection to extension background
 * - Dispatch reload command via CDP message bridge
 * - Verify command executes successfully
 *
 * Note: This test verifies the CDP message bridge works correctly.
 * It does NOT verify the extension actually reloaded (service workers
 * become inactive after reload and don't reappear in CDP targets).
 * Use cdp-reload-extension-keyboard.ts to verify actual reload behavior.
 *
 * Usage: npx ts-node tests/cdp/cdp-reload-extension-messaging.ts
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

let messageId = 1;

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
    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });

    const targets: CDPTarget[] = JSON.parse(data);

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

    console.log(`✓ Connected to background: ${bg.title} (${bg.type})`);
    return bg.webSocketDebuggerUrl;
}

async function main() {
    console.log('CDP Test: Extension Reload (Messaging - Simplified)\n');

    // Check if CDP is available
    const cdpAvailable = await checkCDPAvailable();
    if (!cdpAvailable) {
        console.error('❌ Chrome DevTools Protocol not available on port 9222\n');
        console.log('Please launch Chrome with remote debugging enabled');
        process.exit(1);
    }

    // Find background page
    const wsUrl = await findExtensionBackground();

    // Connect
    const ws = new WebSocket(wsUrl);

    let testPassed = false;
    let testCompleted = false;

    ws.on('open', async () => {
        console.log('✓ Connected to background page\n');

        // Enable Runtime domain
        ws.send(JSON.stringify({
            id: messageId++,
            method: 'Runtime.enable'
        }));

        await new Promise(resolve => setTimeout(resolve, 500));

        console.log('Testing CDP Message Bridge...\n');

        // Dispatch reload command and capture result
        ws.send(JSON.stringify({
            id: 999,  // Use specific ID to track this response
            method: 'Runtime.evaluate',
            params: {
                expression: `
                    (function() {
                        if (typeof globalThis.__CDP_MESSAGE_BRIDGE__ === 'undefined') {
                            return { error: 'CDP Message Bridge not found' };
                        }

                        const result = globalThis.__CDP_MESSAGE_BRIDGE__.dispatch(
                            'cdpReloadExtension',
                            {},
                            true  // expectResponse
                        );

                        return {
                            success: true,
                            result: result,
                            timestamp: Date.now()
                        };
                    })()
                `,
                returnByValue: true,
                awaitPromise: false
            }
        }));

        console.log('✓ Reload command dispatched\n');

        // Set timeout to exit after getting response or 5 seconds
        setTimeout(() => {
            if (!testCompleted) {
                console.log('⚠️  Timeout waiting for response\n');
                ws.close();
                process.exit(testPassed ? 0 : 1);
            }
        }, 5000);
    });

    ws.on('message', (data: WebSocket.Data) => {
        const msg = JSON.parse(data.toString());

        // Check for our reload command response (ID 999)
        if (msg.id === 999) {
            testCompleted = true;

            if (msg.error) {
                console.error('❌ Runtime.evaluate error:', msg.error.message);
                console.log('\n❌ TEST FAILED: Could not execute reload command\n');
                ws.close();
                process.exit(1);
            }

            const result = msg.result?.result?.value;

            if (!result) {
                console.error('❌ No result returned from command');
                console.log('\n❌ TEST FAILED: Empty response\n');
                ws.close();
                process.exit(1);
            }

            if (result.error) {
                console.error(`❌ ${result.error}`);
                console.log('\n❌ TEST FAILED: CDP Message Bridge not available\n');
                ws.close();
                process.exit(1);
            }

            if (result.success && result.result) {
                console.log('✓ CDP Message Bridge found and responded');
                console.log('✓ Reload command executed successfully');
                console.log(`✓ Response: ${JSON.stringify(result.result)}`);
                console.log('✓ Timestamp: ' + new Date(result.timestamp).toISOString());

                console.log('\n' + '='.repeat(60));
                console.log('✅ TEST PASSED: CDP Message Bridge works correctly');
                console.log('='.repeat(60));
                console.log('\nThe reload command was successfully dispatched.');
                console.log('Note: Extension reload verification requires separate test');
                console.log('(service workers become inactive after reload).\n');

                testPassed = true;
                ws.close();
            } else {
                console.error('❌ Unexpected response format:', result);
                console.log('\n❌ TEST FAILED: Invalid response\n');
                ws.close();
                process.exit(1);
            }
        }

        // Log console messages for debugging
        if (msg.method === 'Runtime.consoleAPICalled') {
            const params = msg.params;
            const args = params.args || [];
            const texts = args.map((arg: any) => {
                if (arg.type === 'string') return arg.value;
                if (arg.value !== undefined) return String(arg.value);
                return JSON.stringify(arg);
            });
            console.log(`  [LOG] ${texts.join(' ')}`);
        }
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        process.exit(1);
    });

    ws.on('close', () => {
        process.exit(testPassed ? 0 : 1);
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
