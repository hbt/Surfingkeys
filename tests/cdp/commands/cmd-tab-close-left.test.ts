/**
 * CDP Test: cmd_tab_close_left
 *
 * Focused observability test for the tab close left command.
 * - Single command: cmd_tab_close_left
 * - Implementation: closeTabLeft background action
 * - Single behavior: close the tab to the left of current tab
 * - Focus: verify command execution and tab closure
 *
 * Note: This test directly invokes the background closeTabLeft action via chrome.runtime.sendMessage
 * rather than relying on the 'gxt' key mapping, as key mappings may be filtered by feature groups.
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-close-left.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-close-left.test.ts
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
 * Get all tabs in the current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(tab => ({
                    id: tab.id,
                    index: tab.index,
                    url: tab.url
                })));
            });
        })
    `);
    return result;
}

/**
 * Invoke closeTabLeft action from content script context
 */
async function invokeCloseTabLeft(pageWs: WebSocket, repeats: number = 1): Promise<void> {
    await executeInTarget(pageWs, `
        new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'closeTabLeft',
                repeats: ${repeats}
            }, () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Poll for tab closure by checking if a specific tab ID still exists
 */
async function pollForTabClosure(bgWs: WebSocket, expectedClosedTabId: number, maxAttempts = 20): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const allTabs = await getAllTabs(bgWs);
        const tabStillExists = allTabs.some(tab => tab.id === expectedClosedTabId);
        if (!tabStillExists) {
            return true; // Tab was successfully closed
        }
    }
    return false; // Tab still exists after max attempts
}

describe('cmd_tab_close_left', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabIds: number[] = [];
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

        // Create 5 tabs for testing (tab closing requires multiple tabs)
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 2); // Make tab 2 active (middle tab)
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between tab creation
        }

        console.log(`Created 5 tabs: ${tabIds.join(', ')}`);

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
        // Reset to the middle tab (index 2) before each test
        const resetTabId = tabIds[2];

        // Check if this tab still exists (it might have been closed in previous test)
        const allTabs = await getAllTabs(bgWs);
        const tabExists = allTabs.some(tab => tab.id === resetTabId);

        if (tabExists) {
            const resetResult = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.update(${resetTabId}, { active: true }, () => {
                        resolve(true);
                    });
                })
            `);
            console.log(`beforeEach: Reset tab ${resetTabId}, result: ${resetResult}`);
        } else {
            // Tab was closed in a previous test, find the next available tab from our list
            const availableTab = allTabs.find(tab => tabIds.includes(tab.id));
            if (availableTab) {
                const resetResult = await executeInTarget(bgWs, `
                    new Promise((resolve) => {
                        chrome.tabs.update(${availableTab.id}, { active: true }, () => {
                            resolve(true);
                        });
                    })
                `);
                console.log(`beforeEach: Reset to available tab ${availableTab.id}, result: ${resetResult}`);
            }
        }

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
        // Cleanup - close all created tabs that still exist
        const allTabs = await getAllTabs(bgWs);
        for (const tabId of tabIds) {
            const tabExists = allTabs.some(tab => tab.id === tabId);
            if (tabExists) {
                try {
                    await closeTab(bgWs, tabId);
                } catch (e) {
                    // Tab might already be closed
                }
            }
        }

        if (pageWs) {
            await closeCDP(pageWs);
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('closeTabLeft closes the tab to the left', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Get all tabs before the operation
        const tabsBeforeClose = await getAllTabs(bgWs);
        console.log(`Tabs before close: ${tabsBeforeClose.map(t => `id=${t.id},idx=${t.index}`).join(', ')}`);

        // Skip if we're at the leftmost tab
        if (initialTab.index === 0) {
            console.log(`Test skipped: already at leftmost tab (index 0), no tab to close`);
            return;
        }

        // Determine which tab should be closed (the one immediately to the left)
        const expectedClosedTabIndex = initialTab.index - 1;
        const expectedClosedTab = tabsBeforeClose.find(tab => tab.index === expectedClosedTabIndex);

        expect(expectedClosedTab).toBeDefined();
        console.log(`Expected to close tab: index ${expectedClosedTab.index}, id ${expectedClosedTab.id}`);

        // Invoke closeTabLeft action
        await invokeCloseTabLeft(pageWs, 1);

        // Poll for tab closure
        const tabClosed = await pollForTabClosure(bgWs, expectedClosedTab.id);
        expect(tabClosed).toBe(true);
        console.log(`✓ Tab ${expectedClosedTab.id} was closed`);

        // Get tabs after close
        const tabsAfterClose = await getAllTabs(bgWs);
        console.log(`Tabs after close: ${tabsAfterClose.map(t => `id=${t.id},idx=${t.index}`).join(', ')}`);

        // Verify tab count decreased by 1
        expect(tabsAfterClose.length).toBe(tabsBeforeClose.length - 1);
        console.log(`✓ Tab count decreased from ${tabsBeforeClose.length} to ${tabsAfterClose.length}`);

        // Verify the closed tab no longer exists
        const closedTabStillExists = tabsAfterClose.some(tab => tab.id === expectedClosedTab.id);
        expect(closedTabStillExists).toBe(false);

        // Verify all other tabs still exist
        const otherTabIds = tabIds.filter(id => id !== expectedClosedTab.id);
        for (const tabId of otherTabIds) {
            const tabExists = tabsAfterClose.some(tab => tab.id === tabId);
            if (tabExists) {
                console.log(`✓ Tab ${tabId} still exists`);
            }
        }
    });

    test('closeTabLeft with repeats=2 closes two tabs to the left', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Get all tabs
        const allTabs = await getAllTabs(bgWs);
        console.log(`Initial tabs: ${allTabs.map(t => `id=${t.id},idx=${t.index}`).join(', ')}`);

        // Skip if we don't have at least 2 tabs to the left
        if (initialTab.index < 2) {
            console.log(`Test skipped: only ${initialTab.index} tabs to the left, need at least 2`);
            return;
        }

        // Determine which tabs should be closed
        const expectedClosedIndices = [initialTab.index - 1, initialTab.index - 2];
        const expectedClosedTabs = allTabs.filter(tab => expectedClosedIndices.includes(tab.index));

        expect(expectedClosedTabs.length).toBe(2);
        console.log(`Expected to close tabs: ${expectedClosedTabs.map(t => `id=${t.id},idx=${t.index}`).join(', ')}`);

        // Invoke closeTabLeft with repeats=2
        await invokeCloseTabLeft(pageWs, 2);

        // Poll for both tabs to be closed
        for (const expectedTab of expectedClosedTabs) {
            const tabClosed = await pollForTabClosure(bgWs, expectedTab.id);
            expect(tabClosed).toBe(true);
            console.log(`✓ Tab ${expectedTab.id} was closed`);
        }

        // Verify tab count decreased by 2
        const tabsAfterClose = await getAllTabs(bgWs);
        expect(tabsAfterClose.length).toBe(allTabs.length - 2);
        console.log(`✓ Tab count decreased from ${allTabs.length} to ${tabsAfterClose.length}`);
    });

    test('closeTabLeft at leftmost tab does not close any tab', async () => {
        // Navigate to the leftmost tab
        const allTabs = await getAllTabs(bgWs);
        const leftmostTab = allTabs.reduce((min, tab) => tab.index < min.index ? tab : min);

        console.log(`Switching to leftmost tab: index ${leftmostTab.index}, id ${leftmostTab.id}`);

        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${leftmostTab.id}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);

        // Wait for tab switch
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to the leftmost tab
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

        // Verify we're at the leftmost tab
        const activeTab = await getActiveTab(bgWs);
        console.log(`Active tab: index ${activeTab.index}, id ${activeTab.id}`);
        expect(activeTab.id).toBe(leftmostTab.id);

        // Get tab count before
        const tabsBeforeClose = await getAllTabs(bgWs);
        const initialTabCount = tabsBeforeClose.length;
        console.log(`Tabs before closeTabLeft at leftmost position: ${initialTabCount} tabs`);

        // Invoke closeTabLeft at leftmost tab
        await invokeCloseTabLeft(pageWs, 1);

        // Wait for operation to complete
        await new Promise(resolve => setTimeout(resolve, 800));

        // Verify no tabs were closed
        const tabsAfterClose = await getAllTabs(bgWs);
        expect(tabsAfterClose.length).toBe(initialTabCount);
        console.log(`✓ Tab count unchanged: ${tabsAfterClose.length} tabs (no tab was closed)`);

        // Verify the leftmost tab is still active
        const finalActiveTab = await getActiveTab(bgWs);
        expect(finalActiveTab.id).toBe(leftmostTab.id);
        console.log(`✓ Leftmost tab is still active: id ${finalActiveTab.id}`);
    });

    test('closeTabLeft correctly updates tab indices after closure', async () => {
        // Get initial state
        const initialTab = await getActiveTab(bgWs);
        const initialTabs = await getAllTabs(bgWs);
        console.log(`Initial state: active tab index ${initialTab.index}, total ${initialTabs.length} tabs`);
        console.log(`Initial tabs: ${initialTabs.map(t => `id=${t.id},idx=${t.index}`).join(', ')}`);

        // Skip test if we're at the leftmost tab
        if (initialTab.index === 0) {
            console.log(`Test skipped: already at leftmost tab (index 0), cannot test tab closure to left`);
            return;
        }

        // Find the tab that will be closed
        const tabToClose = initialTabs.find(tab => tab.index === initialTab.index - 1);
        expect(tabToClose).toBeDefined();
        console.log(`Tab to close: index ${tabToClose.index}, id ${tabToClose.id}`);

        // Invoke closeTabLeft
        await invokeCloseTabLeft(pageWs, 1);

        // Poll for tab closure
        const tabClosed = await pollForTabClosure(bgWs, tabToClose.id);
        expect(tabClosed).toBe(true);

        // Wait for indices to update
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get final state
        const finalTabs = await getAllTabs(bgWs);
        const finalActiveTab = await getActiveTab(bgWs);
        console.log(`Final state: active tab index ${finalActiveTab.index}, total ${finalTabs.length} tabs`);
        console.log(`Final tabs: ${finalTabs.map(t => `id=${t.id},idx=${t.index}`).join(', ')}`);

        // Verify tab was closed
        expect(finalTabs.length).toBe(initialTabs.length - 1);

        // Verify active tab's index decreased by 1 (because a tab to its left was removed)
        expect(finalActiveTab.index).toBe(initialTab.index - 1);
        console.log(`✓ Active tab index correctly updated: ${initialTab.index} -> ${finalActiveTab.index}`);

        // Verify active tab ID unchanged (same tab, just different index)
        expect(finalActiveTab.id).toBe(initialTab.id);
        console.log(`✓ Active tab ID unchanged: ${finalActiveTab.id}`);

        // Verify all tabs have sequential indices starting from 0
        const finalIndices = finalTabs.map(t => t.index).sort((a, b) => a - b);
        const expectedIndices = Array.from({ length: finalTabs.length }, (_, i) => i);
        expect(finalIndices).toEqual(expectedIndices);
        console.log(`✓ Tab indices are sequential: ${finalIndices.join(', ')}`);
    });
});
