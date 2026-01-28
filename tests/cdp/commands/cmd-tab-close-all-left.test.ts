/**
 * CDP Test: cmd_tab_close_all_left
 *
 * Focused observability test for the close all tabs on left command.
 * - Single command: cmd_tab_close_all_left
 * - Single key sequence: 'gx0'
 * - Single behavior: close all tabs to the left of current tab
 * - Focus: verify command execution and tab closure with polling
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-close-all-left.test.ts
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

describe('cmd_tab_close_all_left', () => {
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

        // Get initial tab count before creating test tabs
        initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial tab count in window: ${initialTabCount}`);

        // Create 5 tabs for testing
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 2); // Make tab 2 active (middle tab)
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between tab creation
        }

        console.log(`Created ${tabIds.length} test tabs: ${tabIds.join(', ')}`);
        console.log(`Total tabs now: ${await countTabsInWindow(bgWs)}`);

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
        // Reset: ensure we have all 5 tabs and position at middle tab
        const currentTabCount = await countTabsInWindow(bgWs);
        const expectedTabCount = initialTabCount + 5;

        console.log(`beforeEach: Current tab count: ${currentTabCount}, expected: ${expectedTabCount}`);

        if (currentTabCount < expectedTabCount) {
            console.log(`beforeEach: Missing tabs, recreating...`);
            // Close all test tabs
            for (const tabId of tabIds) {
                try {
                    await closeTab(bgWs, tabId);
                } catch (e) {
                    // Tab might already be closed
                }
            }
            await new Promise(resolve => setTimeout(resolve, 300));

            // Recreate 5 tabs
            tabIds = [];
            for (let i = 0; i < 5; i++) {
                const tabId = await createTab(bgWs, FIXTURE_URL, i === 2);
                tabIds.push(tabId);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            console.log(`beforeEach: Recreated ${tabIds.length} tabs`);
        }

        // Reset to middle tab (tabIds[2])
        const resetTabId = tabIds[2];
        const resetResult = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${resetTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        console.log(`beforeEach: Reset to tab ${resetTabId}, result: ${resetResult}`);

        // Wait for tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the reset worked
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

    test('pressing gx0 from middle tab closes 2 tabs on left', async () => {
        console.log(`\n=== TEST: gx0 from middle tab ===`);

        // Get initial state
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial active tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Verify we're at the middle tab (tabIds[2])
        expect(initialTab.id).toBe(tabIds[2]);
        console.log(`✓ Assertion: active tab is tabIds[2] (${tabIds[2]})`);

        // Calculate expected values
        // We're at tabIds[2], so tabs to left are tabIds[0] and tabIds[1]
        const currentTabIndexInArray = 2;
        const tabsToLeft = currentTabIndexInArray; // 0 and 1
        console.log(`Tabs to the left of current: ${tabsToLeft} (tabIds[0] and tabIds[1])`);
        console.log(`Expected tabs after command: ${tabIds.length - tabsToLeft} in our test set`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial total tab count in window: ${initialTabCount}`);

        // Press 'gx0' to close all tabs to the left
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'x', 50);
        await sendKey(pageWs, '0');

        // Poll for tab count to decrease
        const expectedTabCount = initialTabCount - tabsToLeft;
        console.log(`Polling for tab count to reach ${expectedTabCount}...`);
        const tabCountReached = await pollForTabCount(bgWs, expectedTabCount, 5000);

        expect(tabCountReached).toBe(true);
        console.log(`✓ Assertion: tab count reached ${expectedTabCount}`);

        // Verify the final state
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        console.log(`Final tab count: ${tabsAfterCommand.length}`);
        console.log(`Final tabs: ${tabsAfterCommand.map(t => `id=${t.id}`).join(', ')}`);

        // Verify that tabs to the left were closed (tabIds[0] and tabIds[1])
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        console.log(`Remaining test tabs: ${remainingTestTabs.map(t => t.id).join(', ')}`);

        // Should have only the last 3 tabs left (tabIds[2], tabIds[3], tabIds[4])
        expect(remainingTestTabs.length).toBe(3);
        console.log(`✓ Assertion: 3 test tabs remain after closing tabs to left`);

        // Verify specific tabs are gone
        expect(tabsAfterCommand.find(t => t.id === tabIds[0])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[1])).toBeUndefined();
        console.log(`✓ Assertion: tabIds[0] and tabIds[1] were closed`);

        // Verify specific tabs remain
        expect(tabsAfterCommand.find(t => t.id === tabIds[2])).toBeDefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[3])).toBeDefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[4])).toBeDefined();
        console.log(`✓ Assertion: tabIds[2], tabIds[3], and tabIds[4] remain open`);

        // Verify current tab is still active
        const finalActiveTab = await getActiveTab(bgWs);
        expect(finalActiveTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: current tab (${initialTab.id}) is still active`);
    });

    test('pressing gx0 from rightmost tab closes all 4 tabs on left', async () => {
        console.log(`\n=== TEST: gx0 from rightmost tab ===`);

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
        expect(activeTab.id).toBe(rightmostTabId);
        console.log(`✓ Switched to rightmost tab: id ${activeTab.id} (tabIds[4])`);

        // Calculate expected values
        const currentTabIndexInArray = 4;
        const tabsToLeft = currentTabIndexInArray; // 0, 1, 2, 3
        console.log(`Tabs to the left of current: ${tabsToLeft} (all other test tabs)`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial total tab count in window: ${initialTabCount}`);

        // Press 'gx0' to close all tabs to the left
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'x', 50);
        await sendKey(pageWs, '0');

        // Poll for tab count to decrease
        const expectedTabCount = initialTabCount - tabsToLeft;
        console.log(`Polling for tab count to reach ${expectedTabCount}...`);
        const tabCountReached = await pollForTabCount(bgWs, expectedTabCount, 5000);

        expect(tabCountReached).toBe(true);
        console.log(`✓ Assertion: tab count reached ${expectedTabCount}`);

        // Verify the final state
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        console.log(`Final tab count: ${tabsAfterCommand.length}`);

        // Verify only rightmost tab remains from our test tabs
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        expect(remainingTestTabs.length).toBe(1);
        expect(remainingTestTabs[0].id).toBe(tabIds[4]);
        console.log(`✓ Assertion: only tabIds[4] remains from test tabs`);

        // Verify specific tabs are gone
        expect(tabsAfterCommand.find(t => t.id === tabIds[0])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[1])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[2])).toBeUndefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[3])).toBeUndefined();
        console.log(`✓ Assertion: tabIds[0-3] were all closed`);
    });

    test('pressing gx0 from leftmost tab closes nothing (edge case)', async () => {
        console.log(`\n=== TEST: gx0 from leftmost tab (edge case) ===`);

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
        expect(activeTab.id).toBe(leftmostTabId);
        console.log(`✓ Switched to leftmost tab: id ${activeTab.id} (tabIds[0])`);

        // No tabs to the left
        console.log(`Tabs to the left of current: 0 (we're at the leftmost tab)`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial total tab count in window: ${initialTabCount}`);

        // Press 'gx0' - should not close any tabs
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'x', 50);
        await sendKey(pageWs, '0');

        // Wait a bit to ensure command is processed
        await new Promise(resolve => setTimeout(resolve, 800));

        // Verify tab count hasn't changed
        const finalTabCount = await countTabsInWindow(bgWs);
        expect(finalTabCount).toBe(initialTabCount);
        console.log(`✓ Assertion: tab count unchanged (${finalTabCount})`);

        // Verify all test tabs still exist
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        expect(remainingTestTabs.length).toBe(5);
        console.log(`✓ Assertion: all 5 test tabs still exist`);
    });

    test('pressing gx0 from second tab closes only first tab', async () => {
        console.log(`\n=== TEST: gx0 from second tab ===`);

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
        expect(activeTab.id).toBe(secondTabId);
        console.log(`✓ Switched to second tab: id ${activeTab.id} (tabIds[1])`);

        // Calculate expected values
        const currentTabIndexInArray = 1;
        const tabsToLeft = currentTabIndexInArray; // only tabIds[0]
        console.log(`Tabs to the left of current: ${tabsToLeft} (tabIds[0])`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial total tab count in window: ${initialTabCount}`);

        // Press 'gx0' to close all tabs to the left
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'x', 50);
        await sendKey(pageWs, '0');

        // Poll for tab count to decrease
        const expectedTabCount = initialTabCount - tabsToLeft;
        console.log(`Polling for tab count to reach ${expectedTabCount}...`);
        const tabCountReached = await pollForTabCount(bgWs, expectedTabCount, 5000);

        expect(tabCountReached).toBe(true);
        console.log(`✓ Assertion: tab count reached ${expectedTabCount}`);

        // Verify the final state
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        console.log(`Final tab count: ${tabsAfterCommand.length}`);

        // Verify that only tabIds[0] was closed
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        expect(remainingTestTabs.length).toBe(4);
        console.log(`✓ Assertion: 4 test tabs remain`);

        // Verify tabIds[0] is gone
        expect(tabsAfterCommand.find(t => t.id === tabIds[0])).toBeUndefined();
        console.log(`✓ Assertion: tabIds[0] was closed`);

        // Verify others remain
        expect(tabsAfterCommand.find(t => t.id === tabIds[1])).toBeDefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[2])).toBeDefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[3])).toBeDefined();
        expect(tabsAfterCommand.find(t => t.id === tabIds[4])).toBeDefined();
        console.log(`✓ Assertion: tabIds[1-4] remain open`);
    });
});
