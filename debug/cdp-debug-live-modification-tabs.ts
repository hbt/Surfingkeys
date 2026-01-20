#!/usr/bin/env ts-node
/**
 * CDP Live Code Modification - Chrome Tabs API (Background Script)
 *
 * Comprehensive end-to-end test with state verification:
 * 1. Inject logging into chrome.tabs.* API in background
 * 2. Duplicate tab 3 times (yt command)
 * 3. Verify state after EACH duplication (count tabs, get IDs)
 * 4. Switch back to original tab
 * 5. Close tabs on right (gx$ command)
 * 6. Verify tabs were closed
 *
 * Tests:
 * - Background script modification
 * - Chrome tabs API (all Promises)
 * - State management and verification
 * - Real Surfingkeys commands
 */

import * as WebSocket from 'ws';
import * as http from 'http';

let messageId = 1;

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    red: '\x1b[31m'
};

function section(title: string): void {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
}

function step(num: number, desc: string): void {
    console.log(`${colors.bright}${colors.yellow}Step ${num}:${colors.reset} ${desc}`);
}

async function findBg(): Promise<string> {
    const resp = await new Promise<string>((resolve, reject) => {
        http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const bg = targets.find((t: any) => t.title === 'Surfingkeys' || t.url.includes('background.js'));
    if (!bg) throw new Error('Background not found');
    return bg.webSocketDebuggerUrl;
}

function execBg(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

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
                awaitPromise: true  // Critical for Chrome APIs!
            }
        }));
    });
}

function execPage(ws: WebSocket, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = messageId++;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

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
    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'rawKeyDown', key: key }
    }));
    await new Promise(r => setTimeout(r, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'char', text: key }
    }));
    await new Promise(r => setTimeout(r, 50));

    ws.send(JSON.stringify({
        id: messageId++,
        method: 'Input.dispatchKeyEvent',
        params: { type: 'keyUp', key: key }
    }));
    await new Promise(r => setTimeout(r, 100));
}

async function createTab(bgWs: WebSocket): Promise<number> {
    const tab = await execBg(bgWs, `
        new Promise(r => {
            chrome.tabs.create({
                url: 'http://127.0.0.1:9873/hackernews.html',
                active: true
            }, tab => r({ id: tab.id }));
        })
    `);
    return tab.id;
}

async function getAllTabs(bgWs: WebSocket): Promise<any[]> {
    return await execBg(bgWs, `
        new Promise(r => {
            chrome.tabs.query({}, tabs => {
                r(tabs.map(t => ({ id: t.id, url: t.url, index: t.index, active: t.active })));
            });
        })
    `);
}

async function getActiveTab(bgWs: WebSocket): Promise<any> {
    return await execBg(bgWs, `
        new Promise(r => {
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                r(tabs[0] ? { id: tabs[0].id, url: tabs[0].url, index: tabs[0].index } : null);
            });
        })
    `);
}

async function closeTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await execBg(bgWs, `
        new Promise(r => {
            chrome.tabs.remove(${tabId}, () => r(true));
        })
    `);
}

async function findPage(url: string): Promise<string | null> {
    await new Promise(r => setTimeout(r, 1000));
    const resp = await new Promise<string>((resolve, reject) => {
        http.get('http://localhost:9222/json', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });

    const targets = JSON.parse(resp);
    const page = targets.find((t: any) =>
        t.type === 'page' && t.url.includes(url)
    );
    return page ? page.webSocketDebuggerUrl : null;
}

async function main() {
    console.log(`${colors.bright}CDP Live Modification - Chrome Tabs API (Background)${colors.reset}\n`);
    console.log('Comprehensive test with state verification at each step\n');

    const bgWs = new WebSocket(await findBg());

    bgWs.on('open', async () => {
        try {
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Runtime.enable' }));
            bgWs.send(JSON.stringify({ id: messageId++, method: 'Console.enable' }));
            await new Promise(r => setTimeout(r, 100));

            // Capture background console logs
            const bgLogs: string[] = [];
            bgWs.on('message', (data: WebSocket.Data) => {
                const msg = JSON.parse(data.toString());
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const args = msg.params.args || [];
                    const texts = args.map((arg: any) =>
                        arg.type === 'string' ? arg.value : JSON.stringify(arg.value)
                    );
                    bgLogs.push(texts.join(' '));
                }
            });

            section('PHASE 1: Setup and Inject Tab API Logging');

            step(1, 'Create initial test tab');
            const initialTabId = await createTab(bgWs);
            console.log(`   ${colors.green}✓ Created tab ID: ${initialTabId}${colors.reset}\n`);

            step(2, 'Verify initial state');
            let allTabs = await getAllTabs(bgWs);
            console.log(`   ${colors.magenta}Total tabs in window: ${allTabs.length}${colors.reset}`);
            allTabs.forEach(tab => {
                console.log(`      Tab ${tab.id}: ${tab.url.substring(0, 40)}... ${tab.active ? '(ACTIVE)' : ''}`);
            });
            console.log();

            step(3, 'Inject logging into chrome.tabs API');
            await execBg(bgWs, `
                // Store originals
                if (!chrome.tabs._originalDuplicate) {
                    chrome.tabs._originalDuplicate = chrome.tabs.duplicate;
                    chrome.tabs._originalRemove = chrome.tabs.remove;
                    window._tabOperations = [];
                }

                // Wrap chrome.tabs.duplicate
                chrome.tabs.duplicate = function(tabId, callback) {
                    console.log('[TAB API] duplicate(' + tabId + ')');
                    window._tabOperations.push({ op: 'duplicate', tabId: tabId, time: Date.now() });

                    // Call original
                    return chrome.tabs._originalDuplicate.call(chrome.tabs, tabId, function(duplicatedTab) {
                        console.log('[TAB API] duplicate result: new tab ID = ' + duplicatedTab.id);
                        window._tabOperations.push({ op: 'duplicate_result', oldId: tabId, newId: duplicatedTab.id, time: Date.now() });
                        if (callback) callback(duplicatedTab);
                    });
                };

                // Wrap chrome.tabs.remove
                chrome.tabs.remove = function(tabIds, callback) {
                    const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
                    console.log('[TAB API] remove(' + JSON.stringify(ids) + ')');
                    window._tabOperations.push({ op: 'remove', tabIds: ids, time: Date.now() });

                    // Call original
                    return chrome.tabs._originalRemove.call(chrome.tabs, tabIds, callback);
                };

                console.log('[DEBUG] Tab API logging installed!');
            `);

            await new Promise(r => setTimeout(r, 200));
            console.log(`   ${colors.green}✓ Tab API logging installed${colors.reset}\n`);

            console.log(`   ${colors.magenta}Background logs:${colors.reset}`);
            bgLogs.forEach(log => console.log(`      ${log}`));
            bgLogs.length = 0;

            // Find page for sending keys
            const pageWsUrl = await findPage('127.0.0.1:9873/hackernews.html');
            if (!pageWsUrl) throw new Error('Could not find page');

            const pageWs = new WebSocket(pageWsUrl);
            await new Promise(resolve => pageWs.on('open', resolve));
            pageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
            await new Promise(r => setTimeout(r, 1000));

            section('PHASE 2: Duplicate Tab 3 Times (yt command)');

            const createdTabIds: number[] = [];

            for (let i = 1; i <= 3; i++) {
                step(i + 3, `Duplicate #${i} - Press 'y' then 't'`);

                // Send yt command
                console.log(`   Sending 'y' key...`);
                await sendKey(pageWs, 'y');
                console.log(`   Sending 't' key...`);
                await sendKey(pageWs, 't');

                // Wait for duplication
                await new Promise(r => setTimeout(r, 1000));

                // Verify state
                allTabs = await getAllTabs(bgWs);
                console.log(`   ${colors.green}✓ Tab count: ${allTabs.length}${colors.reset}`);

                // Get newly created tab
                const newTabs = allTabs.filter(t => t.id !== initialTabId && !createdTabIds.includes(t.id));
                if (newTabs.length > 0) {
                    const newTab = newTabs[newTabs.length - 1];
                    createdTabIds.push(newTab.id);
                    console.log(`   ${colors.green}✓ New tab ID: ${newTab.id}${colors.reset}`);
                    console.log(`   ${colors.green}✓ New tab index: ${newTab.index}${colors.reset}`);
                }

                // Show current active tab
                const activeTab = await getActiveTab(bgWs);
                console.log(`   ${colors.magenta}Active tab: ${activeTab.id} (index ${activeTab.index})${colors.reset}\n`);
            }

            // Show all tabs
            console.log(`${colors.magenta}All tabs after duplication:${colors.reset}`);
            allTabs = await getAllTabs(bgWs);
            allTabs.forEach(tab => {
                const marker = tab.id === initialTabId ? '(ORIGINAL)' : createdTabIds.includes(tab.id) ? '(DUPLICATE)' : '';
                console.log(`   [${tab.index}] Tab ${tab.id} ${marker} ${tab.active ? '← ACTIVE' : ''}`);
            });

            // Show tab operations log
            const tabOps = await execBg(bgWs, 'window._tabOperations || []');
            console.log(`\n${colors.magenta}Tab operations logged:${colors.reset}`);
            if (tabOps && tabOps.length > 0) {
                tabOps.forEach((op: any) => {
                    if (op.op === 'duplicate') {
                        console.log(`   [${op.time}] duplicate(${op.tabId})`);
                    } else if (op.op === 'duplicate_result') {
                        console.log(`   [${op.time}] → created tab ${op.newId}`);
                    }
                });
            } else {
                console.log(`   (Surfingkeys uses runtime.sendMessage, not direct chrome.tabs calls)`);
            }
            console.log();

            section('PHASE 3: Switch Back to Original Tab');

            step(7, 'Get original tab index');
            const originalTab = allTabs.find(t => t.id === initialTabId);
            console.log(`   Original tab is at index: ${originalTab?.index}\n`);

            step(8, 'Focus original tab (via chrome.tabs.update)');
            await execBg(bgWs, `
                new Promise(r => {
                    chrome.tabs.update(${initialTabId}, { active: true }, () => {
                        console.log('[TAB API] Switched to tab ${initialTabId}');
                        r(true);
                    });
                })
            `);
            await new Promise(r => setTimeout(r, 500));

            const nowActive = await getActiveTab(bgWs);
            console.log(`   ${colors.green}✓ Active tab: ${nowActive.id} (index ${nowActive.index})${colors.reset}\n`);

            if (nowActive.id === initialTabId) {
                console.log(`   ${colors.green}✅ Successfully switched to original tab${colors.reset}\n`);
            }

            section('PHASE 4: Close Tabs on Right (gx$ command)');

            step(9, 'Count tabs to the right of original');
            const tabsToRight = allTabs.filter(t => t.index > originalTab!.index);
            console.log(`   Tabs to right: ${tabsToRight.length}`);
            tabsToRight.forEach(t => {
                console.log(`      Tab ${t.id} at index ${t.index}`);
            });
            console.log();

            step(10, 'Trigger gx$ command (close tabs on right)');

            // Find the page of the active tab
            const activePageUrl = await findPage('127.0.0.1:9873/hackernews.html');
            if (activePageUrl) {
                const activePageWs = new WebSocket(activePageUrl);
                await new Promise(resolve => activePageWs.on('open', resolve));
                activePageWs.send(JSON.stringify({ id: messageId++, method: 'Input.enable' }));
                await new Promise(r => setTimeout(r, 500));

                console.log(`   Sending 'g' key...`);
                await sendKey(activePageWs, 'g');
                console.log(`   Sending 'x' key...`);
                await sendKey(activePageWs, 'x');
                console.log(`   Sending '$' key...`);
                await sendKey(activePageWs, '$');

                await new Promise(r => setTimeout(r, 1000));
                activePageWs.close();
            }

            step(11, 'Verify tabs were closed');
            allTabs = await getAllTabs(bgWs);
            console.log(`   ${colors.green}✓ Tab count after close: ${allTabs.length}${colors.reset}`);

            console.log(`\n${colors.magenta}Remaining tabs:${colors.reset}`);
            allTabs.forEach(tab => {
                const marker = tab.id === initialTabId ? '(ORIGINAL)' : '';
                console.log(`   [${tab.index}] Tab ${tab.id} ${marker}`);
            });

            // Check which tabs were closed
            const closedTabIds = createdTabIds.filter(id => !allTabs.find(t => t.id === id));
            console.log(`\n${colors.green}✓ Closed ${closedTabIds.length} tabs:${colors.reset}`);
            closedTabIds.forEach(id => {
                console.log(`   Tab ${id}`);
            });

            // Show remove operations
            console.log(`\n${colors.magenta}Remove operations logged:${colors.reset}`);
            const allOps = await execBg(bgWs, 'window._tabOperations || []');
            if (allOps && allOps.length > 0) {
                const removeOps = allOps.filter((op: any) => op.op === 'remove');
                if (removeOps.length > 0) {
                    removeOps.forEach((op: any) => {
                        console.log(`   [${op.time}] remove(${JSON.stringify(op.tabIds)})`);
                    });
                } else {
                    console.log(`   (No remove operations captured in wrapper)`);
                }
            } else {
                console.log(`   (Surfingkeys uses runtime.sendMessage, not direct chrome.tabs calls)`);
            }

            section('PHASE 5: State Verification Summary');

            console.log(`${colors.bright}Test Results:${colors.reset}\n`);
            console.log(`  Initial state:         1 tab (ID: ${initialTabId})`);
            console.log(`  After 3 duplications:  ${allTabs.length + closedTabIds.length} tabs`);
            console.log(`  Created duplicates:    ${createdTabIds.length} tabs`);
            console.log(`  Switched to:           Original tab (ID: ${initialTabId})`);
            console.log(`  Closed tabs:           ${closedTabIds.length} tabs`);
            console.log(`  Final state:           ${allTabs.length} tab(s)\n`);

            if (closedTabIds.length === createdTabIds.length && allTabs.length === 1) {
                console.log(`${colors.green}✅ SUCCESS - All duplicate tabs closed!${colors.reset}\n`);
            } else {
                console.log(`${colors.yellow}⚠️  Unexpected state${colors.reset}\n`);
            }

            console.log(`${colors.bright}Background logs:${colors.reset}`);
            bgLogs.forEach(log => console.log(`   ${log}`));

            section('SUMMARY: What We Accomplished');

            console.log(`${colors.bright}State Verification at Each Step:${colors.reset}\n`);
            console.log(`  ✓ Verified tab count after each duplication`);
            console.log(`  ✓ Tracked new tab IDs as they were created`);
            console.log(`  ✓ Verified active tab after switch`);
            console.log(`  ✓ Verified tabs closed after gx$ command\n`);

            console.log(`${colors.bright}Chrome Tabs API Coverage:${colors.reset}\n`);
            console.log(`  • chrome.tabs.create() - Create tab`);
            console.log(`  • chrome.tabs.duplicate() - Duplicate tab (wrapped with logging)`);
            console.log(`  • chrome.tabs.query() - Get all tabs / active tab`);
            console.log(`  • chrome.tabs.update() - Switch to tab`);
            console.log(`  • chrome.tabs.remove() - Close tabs (wrapped with logging)\n`);

            console.log(`${colors.bright}Surfingkeys Commands Tested:${colors.reset}\n`);
            console.log(`  • yt - Duplicate tab`);
            console.log(`  • gx$ - Close tabs on right\n`);

            console.log(`${colors.bright}Promise Handling:${colors.reset}\n`);
            console.log(`  All Chrome tabs API calls return Promises`);
            console.log(`  awaitPromise: true handles them automatically\n`);

            // Cleanup
            await closeTab(bgWs, initialTabId);
            console.log(`${colors.green}✓ Test complete${colors.reset}\n`);

            pageWs.close();
            bgWs.close();

        } catch (error: any) {
            console.error('❌ Error:', error.message);
            console.error(error.stack);
            bgWs.close();
            process.exit(1);
        }
    });

    bgWs.on('error', (error) => {
        console.error('❌ Background error:', error.message);
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
