/**
 * CDP Test: cmd_tab_restore
 *
 * Focused observability test for the tab restore command.
 * - Single command: cmd_tab_restore
 * - Single key: 'X'
 * - Single behavior: restore most recently closed tab
 * - Focus: verify command execution and tab restoration without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-restore.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-tab-restore.test.ts
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
 * Get all tabs in the current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string; active: boolean }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(t => ({
                    id: t.id,
                    index: t.index,
                    url: t.url,
                    active: t.active
                })));
            });
        })
    `);
    return result;
}

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
 * Close a tab by sending 'x' key command
 */
async function closeTabWithCommand(pageWs: WebSocket): Promise<void> {
    await sendKey(pageWs, 'x');
    // Wait for close to complete
    await new Promise(resolve => setTimeout(resolve, 300));
}

/**
 * Poll for a tab with specific URL to exist
 */
async function pollForTabWithUrl(bgWs: WebSocket, url: string, maxAttempts: number = 20): Promise<{ id: number; index: number; url: string } | null> {
    for (let i = 0; i < maxAttempts; i++) {
        const tabs = await getAllTabs(bgWs);
        const foundTab = tabs.find(t => t.url === url);
        if (foundTab) {
            return foundTab;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
}

/**
 * Poll for tab count to match expected value
 */
async function pollForTabCount(bgWs: WebSocket, expectedCount: number, maxAttempts: number = 20): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        const tabs = await getAllTabs(bgWs);
        if (tabs.length === expectedCount) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
}

describe('cmd_tab_restore', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    const FIXTURE_URL_2 = 'http://127.0.0.1:9873/hints-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let testTabIds: number[] = [];
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

        // Create 5 test tabs with known URLs
        // We'll use tab 2 (middle) as our active tab for most tests
        for (let i = 0; i < 5; i++) {
            const url = i === 3 ? FIXTURE_URL_2 : FIXTURE_URL;
            const tabId = await createTab(bgWs, url, i === 2);
            testTabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Connect to the active tab's content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Enable Runtime domain
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
        const resetTabId = testTabIds[2];
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${resetTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        console.log(`beforeEach: Reset to tab ${resetTabId}`);

        // Wait for tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to the active tab
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
        for (const tabId of testTabIds) {
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

    test('pressing X restores most recently closed tab', async () => {
        // Get initial tab count and state
        const initialTabs = await getAllTabs(bgWs);
        const initialCount = initialTabs.length;
        const activeTab = await getActiveTab(bgWs);
        console.log(`Initial state: ${initialCount} tabs, active tab id=${activeTab.id}, url=${activeTab.url}`);

        // Close the current tab using 'x' command
        console.log(`Closing active tab ${activeTab.id} with 'x' command...`);
        await closeTabWithCommand(pageWs);

        // Wait for tab to close and verify count decreased
        const afterCloseCountOk = await pollForTabCount(bgWs, initialCount - 1);
        expect(afterCloseCountOk).toBe(true);

        const afterCloseTabs = await getAllTabs(bgWs);
        console.log(`After close: ${afterCloseTabs.length} tabs (was ${initialCount})`);
        expect(afterCloseTabs.length).toBe(initialCount - 1);

        // Get the new active tab and connect to it
        const newActiveTab = await getActiveTab(bgWs);
        console.log(`New active tab after close: id=${newActiveTab.id}, url=${newActiveTab.url}`);

        // Reconnect to the new active tab to send X command
        const newPageWsUrl = await findContentPage('127.0.0.1:9873');
        const newPageWs = await connectToCDP(newPageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Press X to restore the closed tab
        console.log(`Pressing X to restore closed tab...`);
        await sendKey(newPageWs, 'X');

        // Poll for the closed tab to be restored
        const restoredTab = await pollForTabWithUrl(bgWs, activeTab.url);
        expect(restoredTab).not.toBeNull();
        console.log(`Restored tab found: id=${restoredTab.id}, url=${restoredTab.url}`);

        // Verify tab count returned to original
        const finalTabs = await getAllTabs(bgWs);
        expect(finalTabs.length).toBe(initialCount);
        console.log(`Final tab count: ${finalTabs.length} (back to original ${initialCount})`);

        // Verify the restored tab has the correct URL
        expect(restoredTab.url).toBe(activeTab.url);

        // Cleanup
        await closeCDP(newPageWs);
    });

    test('restoring multiple closed tabs in sequence', async () => {
        // Get initial state
        const initialTabs = await getAllTabs(bgWs);
        const initialCount = initialTabs.length;
        console.log(`Initial tab count: ${initialCount}`);

        // Close first tab (current active tab)
        const firstClosedTab = await getActiveTab(bgWs);
        console.log(`Closing first tab: id=${firstClosedTab.id}, url=${firstClosedTab.url}`);
        await closeTabWithCommand(pageWs);

        // Verify first close
        await pollForTabCount(bgWs, initialCount - 1);
        const afterFirstClose = await getAllTabs(bgWs);
        expect(afterFirstClose.length).toBe(initialCount - 1);
        console.log(`After first close: ${afterFirstClose.length} tabs`);

        // Get new active tab and connect to it
        let activePageWsUrl = await findContentPage('127.0.0.1:9873');
        let activePageWs = await connectToCDP(activePageWsUrl);
        enableInputDomain(activePageWs);
        await waitForSurfingkeysReady(activePageWs);

        // Close second tab
        const secondClosedTab = await getActiveTab(bgWs);
        console.log(`Closing second tab: id=${secondClosedTab.id}, url=${secondClosedTab.url}`);
        await sendKey(activePageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify second close
        await pollForTabCount(bgWs, initialCount - 2);
        const afterSecondClose = await getAllTabs(bgWs);
        expect(afterSecondClose.length).toBe(initialCount - 2);
        console.log(`After second close: ${afterSecondClose.length} tabs`);

        // Reconnect to current active tab
        await closeCDP(activePageWs);
        activePageWsUrl = await findContentPage('127.0.0.1:9873');
        activePageWs = await connectToCDP(activePageWsUrl);
        enableInputDomain(activePageWs);
        await waitForSurfingkeysReady(activePageWs);

        // Restore first closed tab (most recent)
        console.log(`Pressing X to restore second closed tab (most recent)...`);
        await sendKey(activePageWs, 'X');

        // Poll for restoration
        const firstRestored = await pollForTabWithUrl(bgWs, secondClosedTab.url);
        expect(firstRestored).not.toBeNull();
        console.log(`First restore: tab with url=${secondClosedTab.url} restored`);

        // Verify count increased by 1
        await pollForTabCount(bgWs, initialCount - 1);
        const afterFirstRestore = await getAllTabs(bgWs);
        expect(afterFirstRestore.length).toBe(initialCount - 1);

        // Restore second closed tab (next in history)
        console.log(`Pressing X again to restore first closed tab...`);
        await sendKey(activePageWs, 'X');

        // Poll for second restoration
        const secondRestored = await pollForTabWithUrl(bgWs, firstClosedTab.url);
        expect(secondRestored).not.toBeNull();
        console.log(`Second restore: tab with url=${firstClosedTab.url} restored`);

        // Verify count returned to original
        await pollForTabCount(bgWs, initialCount);
        const finalTabs = await getAllTabs(bgWs);
        expect(finalTabs.length).toBe(initialCount);
        console.log(`Final tab count: ${finalTabs.length} (back to original ${initialCount})`);

        // Cleanup
        await closeCDP(activePageWs);
    });

    test('pressing X with no closed tabs does nothing gracefully', async () => {
        // Get initial state (no tabs have been closed yet in this test)
        const initialTabs = await getAllTabs(bgWs);
        const initialCount = initialTabs.length;
        const activeTab = await getActiveTab(bgWs);
        console.log(`Initial state: ${initialCount} tabs, active tab id=${activeTab.id}`);

        // Press X without closing any tabs first
        console.log(`Pressing X with no closed tabs in history...`);
        await sendKey(pageWs, 'X');

        // Wait to see if anything happens
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify tab count unchanged
        const finalTabs = await getAllTabs(bgWs);
        expect(finalTabs.length).toBe(initialCount);
        console.log(`Tab count unchanged: ${finalTabs.length} (still ${initialCount})`);

        // Verify active tab unchanged
        const finalActiveTab = await getActiveTab(bgWs);
        expect(finalActiveTab.id).toBe(activeTab.id);
        console.log(`Active tab unchanged: id=${finalActiveTab.id}`);
    });

    test('restored tab maintains correct URL', async () => {
        // Get the current active tab (should be scroll-test.html from beforeEach)
        const initialTab = await getActiveTab(bgWs);
        const expectedUrl = initialTab.url;
        console.log(`Initial active tab: id=${initialTab.id}, url=${initialTab.url}`);

        // Close this tab
        await sendKey(pageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify tab was closed
        const afterCloseTabs = await getAllTabs(bgWs);
        const closedTabExists = afterCloseTabs.some(t => t.id === initialTab.id);
        expect(closedTabExists).toBe(false);
        console.log(`Tab ${initialTab.id} closed successfully`);

        // Get new active tab and connect to it
        const newActiveTab = await getActiveTab(bgWs);
        const newPageWsUrl = await findContentPage('127.0.0.1:9873');
        const newPageWs = await connectToCDP(newPageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Restore the closed tab
        console.log(`Pressing X to restore tab with URL: ${expectedUrl}`);
        await sendKey(newPageWs, 'X');

        // Poll for restoration and verify URL
        const restoredTab = await pollForTabWithUrl(bgWs, expectedUrl);
        expect(restoredTab).not.toBeNull();
        expect(restoredTab.url).toBe(expectedUrl);
        console.log(`Tab restored with correct URL: ${restoredTab.url}`);

        // Cleanup
        await closeCDP(newPageWs);
    });

    test('pressing 2X restores 2 closed tabs', async () => {
        // Get initial state
        const initialTabs = await getAllTabs(bgWs);
        const initialCount = initialTabs.length;
        console.log(`Initial tab count: ${initialCount}`);

        // Close first tab
        const firstClosedTab = await getActiveTab(bgWs);
        console.log(`Closing first tab: id=${firstClosedTab.id}, url=${firstClosedTab.url}`);
        await closeTabWithCommand(pageWs);
        await pollForTabCount(bgWs, initialCount - 1);

        // Connect to new active tab and close it
        let activePageWsUrl = await findContentPage('127.0.0.1:9873');
        let activePageWs = await connectToCDP(activePageWsUrl);
        enableInputDomain(activePageWs);
        await waitForSurfingkeysReady(activePageWs);

        const secondClosedTab = await getActiveTab(bgWs);
        console.log(`Closing second tab: id=${secondClosedTab.id}, url=${secondClosedTab.url}`);
        await sendKey(activePageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 300));
        await pollForTabCount(bgWs, initialCount - 2);

        console.log(`Two tabs closed, now ${initialCount - 2} tabs remain`);

        // Reconnect to current active tab
        await closeCDP(activePageWs);
        activePageWsUrl = await findContentPage('127.0.0.1:9873');
        activePageWs = await connectToCDP(activePageWsUrl);
        enableInputDomain(activePageWs);
        await waitForSurfingkeysReady(activePageWs);

        // Send '2' followed by 'X' to restore 2 tabs
        console.log(`Sending 2X to restore 2 tabs...`);
        await sendKey(activePageWs, '2', 50);
        await sendKey(activePageWs, 'X');

        // Poll for both tabs to be restored
        const tabsRestoredToOriginal = await pollForTabCount(bgWs, initialCount, 50);
        expect(tabsRestoredToOriginal).toBe(true);

        const finalTabs = await getAllTabs(bgWs);
        expect(finalTabs.length).toBe(initialCount);
        console.log(`After 2X: ${finalTabs.length} tabs (restored to original ${initialCount})`);

        // Verify both URLs are present
        const finalUrls = finalTabs.map(t => t.url);
        expect(finalUrls).toContain(firstClosedTab.url);
        expect(finalUrls).toContain(secondClosedTab.url);
        console.log(`Both closed tabs restored successfully`);

        // Cleanup
        await closeCDP(activePageWs);
    });
});
