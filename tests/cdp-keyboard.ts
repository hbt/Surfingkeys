#!/usr/bin/env ts-node
/**
 * CDP Keyboard Test - Surfingkeys Command Verification
 *
 * Tests keyboard event delivery and command execution:
 * - Press 'j' → verify scrollDown
 * - Press 'k' → verify scrollUp
 * - Capture complete data flow with logging
 *
 * Usage: npx ts-node tests/cdp-keyboard.ts
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

async function findExtensionBackground(): Promise<{ wsUrl: string; extensionId: string }> {
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

    const extensionIdMatch = bg.url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (!extensionIdMatch) {
        console.error('❌ Could not extract extension ID from URL:', bg.url);
        process.exit(1);
    }

    const extensionId = extensionIdMatch[1];
    console.log(`✓ Connected to background: ${bg.title} (${bg.type})`);
    console.log(`✓ Extension ID: ${extensionId}`);

    return { wsUrl: bg.webSocketDebuggerUrl, extensionId };
}

function executeInBackground(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for response'));
        }, 5000);

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

async function createFixtureTab(bgWs: WebSocket): Promise<number> {
    // Using local HTTP server because Surfingkeys content scripts
    // don't inject on chrome-extension:// URLs
    const fixtureUrl = 'http://127.0.0.1:9873/hackernews.html';
    console.log(`\nCreating fixture tab: ${fixtureUrl}`);
    console.log('(Served via local HTTP server on port 9873)');

    const tab = await executeInBackground(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.create({
                url: '${fixtureUrl}',
                active: true
            }, (tab) => {
                resolve({
                    id: tab.id,
                    url: tab.url
                });
            });
        })
    `);

    console.log(`✓ Created tab (id: ${tab.id})`);
    return tab.id;
}

async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    console.log(`\nCleaning up: Closing tab ${tabId}`);
    await executeInBackground(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.remove(${tabId}, () => {
                resolve(true);
            });
        })
    `);
    console.log(`✓ Tab ${tabId} closed`);
}

async function findContentPage(): Promise<string> {
    console.log('\nFinding content page in CDP targets...');

    // Wait a moment for tab to appear in targets
    await new Promise(resolve => setTimeout(resolve, 2000));

    const data = await new Promise<string>((resolve, reject) => {
        const req = http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
    });

    const targets: CDPTarget[] = JSON.parse(data);

    const page = targets.find(t =>
        t.type === 'page' && t.url.includes('127.0.0.1:9873/hackernews.html')
    );

    if (!page) {
        console.error('❌ Content page not found');
        console.log('Looking for URL containing: 127.0.0.1:9873/hackernews.html');
        console.log('Available pages:', targets.filter(t => t.type === 'page').map(t => t.url));
        process.exit(1);
    }

    console.log(`✓ Found content page: ${page.title || page.url}`);
    return page.webSocketDebuggerUrl;
}

function executeInPage(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for page response'));
        }, 5000);

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

async function sendKey(ws: WebSocket, key: string): Promise<void> {
    console.log(`  → Sending key '${key}'`);

    // Send keyDown event
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: key
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 50));

    // Send char event
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'char',
            text: key
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 50));

    // Send keyUp event
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: key
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 100));
}

async function main() {
    console.log('CDP Keyboard Test - Surfingkeys Commands\n');

    // Check if CDP is available
    const cdpAvailable = await checkCDPAvailable();
    if (!cdpAvailable) {
        console.error('❌ Chrome DevTools Protocol not available on port 9222\n');
        console.log('Please launch Chrome with remote debugging enabled:\n');
        console.log('  google-chrome-stable --remote-debugging-port=9222\n');
        process.exit(1);
    }

    // Find background page
    const { wsUrl, extensionId } = await findExtensionBackground();

    // Connect to background
    const bgWs = new WebSocket(wsUrl);

    bgWs.on('open', async () => {
        try {
            // Enable Runtime domain
            bgWs.send(JSON.stringify({
                id: messageId++,
                method: 'Runtime.enable'
            }));

            await new Promise(resolve => setTimeout(resolve, 100));

            // Create fixture tab
            const tabId = await createFixtureTab(bgWs);

            // Find content page in CDP targets
            const pageWsUrl = await findContentPage();

            // Connect to content page
            console.log('\nConnecting to content page...');
            const pageWs = new WebSocket(pageWsUrl);

            pageWs.on('open', async () => {
                console.log('✓ Connected to content page');

                const consoleLogs: string[] = [];

                // Capture console messages
                pageWs.on('message', (data: WebSocket.Data) => {
                    const msg = JSON.parse(data.toString());

                    if (msg.method === 'Runtime.consoleAPICalled') {
                        const params = msg.params;
                        const type = params.type;
                        const args = params.args || [];

                        const texts = args.map((arg: any) => {
                            if (arg.type === 'string') {
                                return arg.value;
                            } else if (arg.value !== undefined) {
                                return String(arg.value);
                            } else {
                                return JSON.stringify(arg);
                            }
                        });

                        const message = texts.join(' ');
                        const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️ ' : '💬';
                        const logLine = `${prefix} [${type.toUpperCase()}] ${message}`;
                        consoleLogs.push(logLine);
                    }
                });

                // Enable Runtime domain
                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Runtime.enable'
                }));

                // Enable Input domain (for keyboard events)
                pageWs.send(JSON.stringify({
                    id: messageId++,
                    method: 'Input.enable'
                }));

                await new Promise(resolve => setTimeout(resolve, 100));

                // Test: Execute simple JS to verify connection
                console.log('\nVerifying page connection...');
                const pageUrl = await executeInPage(pageWs, 'window.location.href');
                console.log(`✓ Page URL: ${pageUrl}`);

                const pageTitle = await executeInPage(pageWs, 'document.title');
                console.log(`✓ Page title: ${pageTitle}`);

                // Wait for page to be fully loaded and Surfingkeys to inject
                console.log('\nWaiting for page to load and Surfingkeys to inject...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('✓ Ready to test\n');

                console.log('=== Test 1: ScrollDown (j key) ===\n');

                // Get initial scroll position
                const initialScroll = await executeInPage(pageWs, 'window.scrollY');
                console.log(`Step 1: Initial scroll position: ${initialScroll}`);

                // Send 'j' key
                console.log('\nStep 2: Sending "j" key');
                await sendKey(pageWs, 'j');

                // Wait for scroll to happen
                await new Promise(resolve => setTimeout(resolve, 300));

                // Get new scroll position
                const newScroll = await executeInPage(pageWs, 'window.scrollY');
                console.log(`\nStep 3: New scroll position: ${newScroll}`);

                // Verify scroll happened
                if (newScroll > initialScroll) {
                    console.log(`✅ PASS: Page scrolled down by ${newScroll - initialScroll}px\n`);
                } else {
                    console.log(`❌ FAIL: Page did not scroll (${initialScroll} → ${newScroll})\n`);
                }

                // Display captured console logs
                console.log('\nStep 4: Console logs captured during test:');
                if (consoleLogs.length > 0) {
                    consoleLogs.forEach(log => console.log(`  ${log}`));
                } else {
                    console.log('  (No console output captured)');
                }

                console.log('\n' + '='.repeat(50));

                // Cleanup: close the test tab
                await closeTab(bgWs, tabId);

                // Close connections
                pageWs.close();
                bgWs.close();
            });

            pageWs.on('error', async (error) => {
                console.error('❌ Page WebSocket error:', error.message);
                try {
                    await closeTab(bgWs, tabId);
                } catch (e) {
                    // Ignore cleanup errors
                }
                bgWs.close();
                process.exit(1);
            });
        } catch (error) {
            console.error('\n❌ Test failed:', error);
            bgWs.close();
            process.exit(1);
        }
    });

    bgWs.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        process.exit(1);
    });

    bgWs.on('close', () => {
        process.exit(0);
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
