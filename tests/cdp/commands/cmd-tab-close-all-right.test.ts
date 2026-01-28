/**
 * CDP Test: cmd_tab_close_all_right
 *
 * Focused observability test for the tab close all right command.
 * - Single command: cmd_tab_close_all_right
 * - Single key sequence: 'gx$'
 * - Single behavior: close all tabs to the right of current tab
 * - Focus: verify command execution and tab closure with polling
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-close-all-right.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-close-all-right.test.ts
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    findContentPage,
    connectToCDP,
    createTab,
    closeTab,
    closeCDP,
    executeInTarget
} from '../utils/cdp-client';
import {
    sendKey,
    enableInputDomain,
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Get the currently active tab
 */
async function getActiveTab(bgWs: WebSocket): Promise<{ id: number; index: number; url: string }> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    resolve({
                        id: tabs[0].id,
                        index: tabs[0].index,
                        url: tabs[0].url
                    });
                } else {
                    resolve(null);
                }
            });
        })
    `);
    return result;
}

/**
 * Count tabs in the current window
 */
async function countTabsInWindow(bgWs: WebSocket): Promise<number> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.length);
            });
        })
    `);
    return result;
}

/**
 * Get all tabs in the current window
 */
async function getTabsInWindow(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(t => ({ id: t.id, index: t.index, url: t.url })));
            });
        })
    `);
    return result;
}

/**
 * Poll for tab count to reach expected value
 */
async function pollForTabCount(bgWs: WebSocket, expectedCount: number, timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const currentCount = await countTabsInWindow(bgWs);
        if (currentCount === expectedCount) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
}

describe('cmd_tab_close_all_right', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabIds: number[] = [];
    let initialTabCount: number = 0;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    beforeAll(async () => {
        // Check CDP is available
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        // Connect to background
        const bgInfo = await findExtensionBackground();
        extensionId = bgInfo.extensionId;
        bgWs = await connectToCDP(bgInfo.wsUrl);

        // Get initial tab count (may include existing browser tabs)
        initialTabCount = await countTabsInWindow(bgWs);
        console.log(`beforeAll: Initial tab count in window: ${initialTabCount}`);

        // Create 5 tabs for testing
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 2); // Make tab 2 active (middle tab)
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between tab creation
        }

        console.log(`beforeAll: Created 5 test tabs with IDs: ${tabIds.join(', ')}`);

        // Connect to the active tab's content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Enable Runtime domain for console logging
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Reset to the fixture tab before each test
        const resetTabId = tabIds[2];
        const resetResult = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${resetTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        console.log(`beforeEach: Reset tab ${resetTabId}, result: ${resetResult}`);

        // Wait for tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the reset worked by checking which tab is active
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}`);

        // Always reconnect to the active tab to ensure fresh connection
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        console.log(`beforeEach: Found content page WebSocket URL: ${pageWsUrl}`);
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);
        console.log(`beforeEach: Reconnected to content page and ready`);

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        // Capture coverage snapshot after test and calculate delta
        await captureAfterCoverage(pageWs, currentTestName, beforeCovData);
    });

    afterAll(async () => {
        // Cleanup - close all created tabs
        for (const tabId of tabIds) {
            try {
                await closeTab(bgWs, tabId);
            } catch (e) {
                // Tab might already be closed
            }
        }

        if (pageWs) {
            await closeCDP(pageWs);
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('pressing gx$ from middle tab closes all tabs to the right', async () => {
        // === SETUP VERIFICATION ===
        console.log(`\n=== TEST SETUP STATE ===`);
        const tabsBeforeCommand = await getTabsInWindow(bgWs);
        console.log(`Total tabs in window: ${tabsBeforeCommand.length}`);
        console.log(`Our test tabs: ${tabIds.join(', ')}`);

        // Get initial active tab (should be tabIds[2], the middle tab)
        const initialTab = await getActiveTab(bgWs);
        console.log(`Current active tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Verify we're at the middle tab
        expect(initialTab.id).toBe(tabIds[2]);
        console.log(`✓ Assertion: we are at tabIds[2] (id=${tabIds[2]}), the middle tab`);

        // Count tabs to the right of current tab (in our test tabs)
        const currentTabIndexInArray = tabIds.indexOf(initialTab.id);
        const tabsToRight = tabIds.length - currentTabIndexInArray - 1;
        console.log(`Tabs to the right of current: ${tabsToRight} (tabIds[3] and tabIds[4])`);
        console.log(`Expected tabs after command: ${tabIds.length - tabsToRight} in our test set`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial total tab count in window: ${initialTabCount}`);

        // Press 'gx$' to close all tabs to the right
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'x', 50);
        await sendKey(pageWs, '$');

        // Poll for tab count to decrease
        const expectedTabCount = initialTabCount - tabsToRight;
        console.log(`Polling for tab count to reach ${expectedTabCount}...`);
        const tabCountReached = await pollForTabCount(bgWs, expectedTabCount, 5000);

        expect(tabCountReached).toBe(true);
        console.log(`✓ Assertion: tab count reached ${expectedTabCount}`);

        // Verify the final state
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        console.log(`Final tab count: ${tabsAfterCommand.length}`);
        console.log(`Final tabs: ${tabsAfterCommand.map(t => `id=${t.id}`).join(', ')}`);

        // Verify that tabs to the right were closed (tabIds[3] and tabIds[4])
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        console.log(`Remaining test tabs: ${remainingTestTabs.map(t => t.id).join(', ')}`);

        // Should have only the first 3 tabs left (tabIds[0], tabIds[1], tabIds[2])
        expect(remainingTestTabs.length).toBe(3);
        console.log(`✓ Assertion: 3 test tabs remain after closing tabs to right`);

        // Verify specific tabs are gone
        expect(tabsAfterCommand.find(t => t.id === tabIds[3])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[4])).toBeUndefined();
        console.log(`✓ Assertion: tabIds[3] and tabIds[4] were closed`);

        // Verify specific tabs remain
        expect(tabsAfterCommand.find(t => t.id === tabIds[0])).toBeDefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[1])).toBeDefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[2])).toBeDefined();
        console.log(`✓ Assertion: tabIds[0], tabIds[1], and tabIds[2] remain open`);

        // Verify current tab is still active
        const finalActiveTab = await getActiveTab(bgWs);
        expect(finalActiveTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: current tab (${initialTab.id}) is still active`);
    });

    test('pressing gx$ from leftmost tab closes all other tabs', async () => {
        console.log(`\n=== TEST: gx$ from leftmost tab ===`);

        // Activate the leftmost tab (tabIds[0])
        const leftmostTabId = tabIds[0];
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${leftmostTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to the newly active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);

        const activeTab = await getActiveTab(bgWs);
        console.log(`Current active tab: index ${activeTab.index}, id ${activeTab.id}`);
        expect(activeTab.id).toBe(leftmostTabId);
        console.log(`✓ Assertion: we are at leftmost tab (tabIds[0])`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial tab count: ${initialTabCount}`);

        // All tabs to the right should be closed (4 tabs: tabIds[1], [2], [3], [4])
        const tabsToRight = 4;

        // Press 'gx$' to close all tabs to the right
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'x', 50);
        await sendKey(pageWs, '$');

        // Poll for tab count to decrease
        const expectedTabCount = initialTabCount - tabsToRight;
        console.log(`Polling for tab count to reach ${expectedTabCount}...`);
        const tabCountReached = await pollForTabCount(bgWs, expectedTabCount, 5000);

        expect(tabCountReached).toBe(true);
        console.log(`✓ Assertion: tab count reached ${expectedTabCount}`);

        // Verify the final state
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        console.log(`Remaining test tabs: ${remainingTestTabs.map(t => t.id).join(', ')}`);

        // Should have only the leftmost tab left
        expect(remainingTestTabs.length).toBe(1);
        expect(remainingTestTabs[0].id).toBe(leftmostTabId);
        console.log(`✓ Assertion: only leftmost tab (tabIds[0]) remains`);

        // Verify all other tabs are gone
        expect(tabsAfterCommand.find(t => t.id === tabIds[1])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[2])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[3])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[4])).toBeUndefined();
        console.log(`✓ Assertion: all tabs to the right were closed`);
    });

    test('pressing gx$ from rightmost tab closes nothing', async () => {
        console.log(`\n=== TEST: gx$ from rightmost tab (edge case) ===`);

        // Activate the rightmost tab (tabIds[4])
        const rightmostTabId = tabIds[4];
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${rightmostTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to the newly active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);

        const activeTab = await getActiveTab(bgWs);
        console.log(`Current active tab: index ${activeTab.index}, id ${activeTab.id}`);
        expect(activeTab.id).toBe(rightmostTabId);
        console.log(`✓ Assertion: we are at rightmost tab (tabIds[4])`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial tab count: ${initialTabCount}`);

        // Press 'gx$' to close all tabs to the right (should be none)
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'x', 50);
        await sendKey(pageWs, '$');

        // Wait a bit for any potential tab closure
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify tab count hasn't changed
        const finalTabCount = await countTabsInWindow(bgWs);
        console.log(`Final tab count: ${finalTabCount}`);

        expect(finalTabCount).toBe(initialTabCount);
        console.log(`✓ Assertion: tab count unchanged (no tabs to close)`);

        // Verify all tabs still exist
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        expect(remainingTestTabs.length).toBe(5);
        console.log(`✓ Assertion: all 5 test tabs still exist`);

        // Verify current tab is still active
        const finalActiveTab = await getActiveTab(bgWs);
        expect(finalActiveTab.id).toBe(rightmostTabId);
        console.log(`✓ Assertion: rightmost tab is still active`);
    });

    test('pressing gx$ from second tab closes 3 tabs to the right', async () => {
        console.log(`\n=== TEST: gx$ from second tab ===`);

        // Activate the second tab (tabIds[1])
        const secondTabId = tabIds[1];
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${secondTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to the newly active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);

        const activeTab = await getActiveTab(bgWs);
        console.log(`Current active tab: index ${activeTab.index}, id ${activeTab.id}`);
        expect(activeTab.id).toBe(secondTabId);
        console.log(`✓ Assertion: we are at second tab (tabIds[1])`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial tab count: ${initialTabCount}`);

        // 3 tabs to the right should be closed (tabIds[2], [3], [4])
        const tabsToRight = 3;

        // Press 'gx$' to close all tabs to the right
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'x', 50);
        await sendKey(pageWs, '$');

        // Poll for tab count to decrease
        const expectedTabCount = initialTabCount - tabsToRight;
        console.log(`Polling for tab count to reach ${expectedTabCount}...`);
        const tabCountReached = await pollForTabCount(bgWs, expectedTabCount, 5000);

        expect(tabCountReached).toBe(true);
        console.log(`✓ Assertion: tab count reached ${expectedTabCount}`);

        // Verify the final state
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        console.log(`Remaining test tabs: ${remainingTestTabs.map(t => t.id).join(', ')}`);

        // Should have only the first 2 tabs left (tabIds[0] and tabIds[1])
        expect(remainingTestTabs.length).toBe(2);
        console.log(`✓ Assertion: 2 test tabs remain after closing tabs to right`);

        // Verify specific tabs remain
        expect(tabsAfterCommand.find(t => t.id === tabIds[0])).toBeDefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[1])).toBeDefined();
        console.log(`✓ Assertion: tabIds[0] and tabIds[1] remain open`);

        // Verify specific tabs are gone
        expect(tabsAfterCommand.find(t => t.id === tabIds[2])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[3])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[4])).toBeUndefined();
        console.log(`✓ Assertion: tabIds[2], tabIds[3], and tabIds[4] were closed`);

        // Verify current tab is still active
        const finalActiveTab = await getActiveTab(bgWs);
        expect(finalActiveTab.id).toBe(secondTabId);
        console.log(`✓ Assertion: second tab (${secondTabId}) is still active`);
    });
});
