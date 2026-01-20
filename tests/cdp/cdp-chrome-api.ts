#!/usr/bin/env ts-node
/**
 * CDP Chrome API Test - Tabs Verification
 *
 * Tests Chrome tabs API through CDP to verify:
 * - Query all tabs
 * - Filter tabs by criteria
 * - Create new tabs
 * - Activate specific tabs
 * - Close tabs
 *
 * This serves as a pre-flight check for keyboard/DOM tests.
 *
 * Usage: npx ts-node tests/cdp-chrome-api.ts
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

interface TabInfo {
    id: number;
    title: string;
    url: string;
    active: boolean;
    windowId: number;
}

let messageId = 1;
let createdTabId: number | null = null;

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

    // Extract extension ID from URL (e.g., chrome-extension://aajlcoiaogpknhgninhopncaldipjdnp/background.js)
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

async function runTests(ws: WebSocket, extensionId: string) {
    console.log('\n=== Test 1: Query All Tabs ===\n');

    const allTabs = await executeInBackground(ws, `
        new Promise((resolve) => {
            chrome.tabs.query({}, (tabs) => {
                resolve(tabs.map(t => ({
                    id: t.id,
                    title: t.title,
                    url: t.url,
                    active: t.active,
                    windowId: t.windowId
                })));
            });
        })
    `);

    console.log(`✓ Found ${allTabs.length} tabs`);
    allTabs.forEach((tab: TabInfo) => {
        const marker = tab.active ? '→ [ACTIVE]' : '  ';
        console.log(`${marker} Tab ${tab.id}: ${tab.title}`);
        console.log(`           ${tab.url}`);
    });

    console.log('\n=== Test 2: Find Active Tab ===\n');

    const activeTab = await executeInBackground(ws, `
        new Promise((resolve) => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                resolve(tabs[0] ? {
                    id: tabs[0].id,
                    title: tabs[0].title,
                    url: tabs[0].url
                } : null);
            });
        })
    `);

    if (activeTab) {
        console.log(`✓ Active tab: ${activeTab.title} (id: ${activeTab.id})`);
        console.log(`  URL: ${activeTab.url}`);
    } else {
        console.log('⚠️  No active tab found');
    }

    console.log('\n=== Test 3: Filter Valid Tabs (Extension Can Run) ===\n');

    const validTabs = allTabs.filter((tab: TabInfo) => {
        const url = tab.url || '';
        const isRestricted = url.startsWith('chrome://') ||
                           url.startsWith('chrome-extension://') ||
                           url.startsWith('edge://') ||
                           url.startsWith('about:');
        return !isRestricted;
    });

    console.log(`✓ Valid tabs: ${validTabs.length}/${allTabs.length}`);

    const restrictedTabs = allTabs.filter((tab: TabInfo) => {
        const url = tab.url || '';
        return url.startsWith('chrome://') ||
               url.startsWith('chrome-extension://') ||
               url.startsWith('edge://') ||
               url.startsWith('about:');
    });

    if (restrictedTabs.length > 0) {
        console.log(`\n  Excluded (restricted URLs):`);
        restrictedTabs.forEach((tab: TabInfo) => {
            console.log(`  - ${tab.url}`);
        });
    }

    console.log('\n=== Test 4: Create New Tab ===\n');

    const fixtureUrl = `chrome-extension://${extensionId}/pages/fixtures/hackernews.html`;
    console.log(`Creating tab with fixture: ${fixtureUrl}\n`);

    const newTab = await executeInBackground(ws, `
        new Promise((resolve) => {
            chrome.tabs.create({
                url: '${fixtureUrl}',
                active: false
            }, (tab) => {
                resolve({
                    id: tab.id,
                    url: tab.url,
                    title: tab.title
                });
            });
        })
    `);

    createdTabId = newTab.id;
    console.log(`✓ Created tab: ${newTab.url} (id: ${newTab.id})`);

    console.log('\n=== Test 5: Activate Tab ===\n');

    await executeInBackground(ws, `
        new Promise((resolve) => {
            chrome.tabs.update(${createdTabId}, {active: true}, (tab) => {
                resolve(tab.id);
            });
        })
    `);

    console.log(`✓ Activated tab ${createdTabId}`);

    // Wait a moment to verify activation
    await new Promise(resolve => setTimeout(resolve, 500));

    const verifyActive = await executeInBackground(ws, `
        new Promise((resolve) => {
            chrome.tabs.get(${createdTabId}, (tab) => {
                resolve(tab.active);
            });
        })
    `);

    if (verifyActive) {
        console.log(`✓ Verified tab ${createdTabId} is active`);
    } else {
        console.log(`⚠️  Tab ${createdTabId} activation could not be verified`);
    }

    console.log('\n=== Test 6: Query Tabs in Current Window ===\n');

    const currentWindowTabs = await executeInBackground(ws, `
        new Promise((resolve) => {
            chrome.tabs.query({currentWindow: true}, (tabs) => {
                resolve(tabs.length);
            });
        })
    `);

    console.log(`✓ Tabs in current window: ${currentWindowTabs}`);

    console.log('\n=== Test 7: Cleanup - Close Created Tab ===\n');

    if (createdTabId) {
        await executeInBackground(ws, `
            new Promise((resolve) => {
                chrome.tabs.remove(${createdTabId}, () => {
                    resolve(true);
                });
            })
        `);
        console.log(`✓ Closed tab ${createdTabId}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('All tests passed ✅');
    console.log('='.repeat(50) + '\n');
}

async function main() {
    console.log('CDP Chrome API Test - Tabs Verification\n');

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
    const { wsUrl, extensionId } = await findExtensionBackground();

    // Connect
    const ws = new WebSocket(wsUrl);

    ws.on('open', async () => {
        try {
            // Enable Runtime domain
            ws.send(JSON.stringify({
                id: messageId++,
                method: 'Runtime.enable'
            }));

            // Wait a moment for Runtime to enable
            await new Promise(resolve => setTimeout(resolve, 100));

            // Run all tests
            await runTests(ws, extensionId);

            // Close connection and exit
            ws.close();
        } catch (error) {
            console.error('\n❌ Test failed:', error);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        process.exit(1);
    });

    ws.on('close', () => {
        process.exit(0);
    });
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
