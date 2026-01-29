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
        // Close all existing test tabs to ensure clean state
        for (const tabId of tabIds) {
            try {
                await closeTab(bgWs, tabId);
            } catch (e) {
                // Tab might already be closed, that's OK
            }
        }

        // Wait for tabs to close
        await new Promise(resolve => setTimeout(resolve, 300));

        // Recreate 5 fresh tabs for the test
        tabIds = [];
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 2); // Make tab 2 active (middle tab)
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`beforeEach: Recreated 5 test tabs with IDs: ${tabIds.join(', ')}`);

        // Verify the active tab
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: Active tab is index ${verifyTab.index}, id ${verifyTab.id} (should be tabIds[2]=${tabIds[2]})`);

        // Connect to the active tab's content page
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
        // The command closes ALL tabs to the left in the window, not just from our test set
        // If current tab is at index 5, it will close tabs at indices 0-4 (5 tabs total)
        const tabsToLeftInWindow = initialTab.index; // All tabs with index < initialTab.index
        console.log(`Tabs to the left of current tab in window: ${tabsToLeftInWindow} (all tabs at indices 0-${initialTab.index-1})`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial total tab count in window: ${initialTabCount}`);

        // Press 'gx0' to close all tabs to the left
        console.log(`Sending keys: 'g', 'x', '0'...`);
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'x');
        await sendKey(pageWs, '0');
        console.log(`Keys sent, waiting for tab closure...`);

        // Wait a moment for the command to process
        await new Promise(resolve => setTimeout(resolve, 500));

        // Poll for tab count to decrease
        const expectedTabCount = initialTabCount - tabsToLeftInWindow;
        console.log(`Polling for tab count to reach ${expectedTabCount} (initial ${initialTabCount} minus ${tabsToLeftInWindow} tabs to left)...`);
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
        console.log(`✓ Switched to rightmost tab: id ${activeTab.id} (tabIds[4]) at window index ${activeTab.index}`);

        // Calculate expected values - close all tabs to the left in the window
        const tabsToLeftInWindow = activeTab.index; // All tabs with index < activeTab.index
        console.log(`Tabs to the left of current: ${tabsToLeftInWindow} (all tabs at indices 0-${activeTab.index-1})`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial total tab count in window: ${initialTabCount}`);

        // Press 'gx0' to close all tabs to the left
        console.log(`Sending keys: 'g', 'x', '0'...`);
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'x');
        await sendKey(pageWs, '0');
        console.log(`Keys sent, waiting for tab closure...`);

        // Wait a moment for the command to process
        await new Promise(resolve => setTimeout(resolve, 500));

        // Poll for tab count to decrease
        const expectedTabCount = initialTabCount - tabsToLeftInWindow;
        console.log(`Polling for tab count to reach ${expectedTabCount} (initial ${initialTabCount} minus ${tabsToLeftInWindow} tabs to left)...`);
        const tabCountReached = await pollForTabCount(bgWs, expectedTabCount, 5000);

        expect(tabCountReached).toBe(true);
        console.log(`✓ Assertion: tab count reached ${expectedTabCount}`);

        // Verify the final state
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        console.log(`Final tab count: ${tabsAfterCommand.length}`);
        console.log(`Final tabs: ${tabsAfterCommand.map(t => `id=${t.id},idx=${t.index}`).join(', ')}`);

        // Verify only tabs that were to the right of the active tab remain
        // All test tabs except the rightmost one should be closed
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        console.log(`Remaining test tabs: ${remainingTestTabs.map(t => `id=${t.id}`).join(', ')}`);

        // Only the rightmost test tab should remain
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
        console.log(`✓ Switched to second tab: id ${activeTab.id} (tabIds[1]) at window index ${activeTab.index}`);

        // Calculate expected values - close all tabs to the left in the window
        const tabsToLeftInWindow = activeTab.index; // All tabs with index < activeTab.index
        console.log(`Tabs to the left of current: ${tabsToLeftInWindow} (all tabs at indices 0-${activeTab.index-1})`);

        const initialTabCount = await countTabsInWindow(bgWs);
        console.log(`Initial total tab count in window: ${initialTabCount}`);

        // Press 'gx0' to close all tabs to the left
        console.log(`Sending keys: 'g', 'x', '0'...`);
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'x');
        await sendKey(pageWs, '0');
        console.log(`Keys sent, waiting for tab closure...`);

        // Wait a moment for the command to process
        await new Promise(resolve => setTimeout(resolve, 500));

        // Poll for tab count to decrease
        const expectedTabCount = initialTabCount - tabsToLeftInWindow;
        console.log(`Polling for tab count to reach ${expectedTabCount} (initial ${initialTabCount} minus ${tabsToLeftInWindow} tabs to left)...`);
        const tabCountReached = await pollForTabCount(bgWs, expectedTabCount, 5000);

        expect(tabCountReached).toBe(true);
        console.log(`✓ Assertion: tab count reached ${expectedTabCount}`);

        // Verify the final state
        const tabsAfterCommand = await getTabsInWindow(bgWs);
        console.log(`Final tab count: ${tabsAfterCommand.length}`);
        console.log(`Final tabs: ${tabsAfterCommand.map(t => `id=${t.id},idx=${t.index}`).join(', ')}`);

        // Verify that tabs to the left were closed
        const remainingTestTabs = tabsAfterCommand.filter(t => tabIds.includes(t.id));
        console.log(`Remaining test tabs: ${remainingTestTabs.map(t => `id=${t.id}`).join(', ')}`);

        // Should have 4 test tabs remaining (all except tabIds[0])
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
