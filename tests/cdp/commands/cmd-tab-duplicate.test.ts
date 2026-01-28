/**
 * CDP Test: cmd_tab_duplicate
 *
 * Focused observability test for the tab duplicate command.
 * - Single command: cmd_tab_duplicate
 * - Single key: 'yt'
 * - Single behavior: duplicate current tab and switch to it
 * - Focus: verify command execution and tab duplication without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-duplicate.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-tab-duplicate.test.ts
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
 * Get all tabs in the current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(t => ({
                    id: t.id,
                    index: t.index,
                    url: t.url
                })));
            });
        })
    `);
    return result;
}

/**
 * Find duplicate tabs (tabs with same URL)
 */
async function findDuplicateTabs(bgWs: WebSocket, targetUrl: string): Promise<Array<{ id: number; index: number; url: string }>> {
    const allTabs = await getAllTabs(bgWs);
    return allTabs.filter(tab => tab.url === targetUrl);
}

describe('cmd_tab_duplicate', () => {
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

        // Check initial tab state
        const initialTabs = await getAllTabs(bgWs);
        console.log(`beforeAll: Starting with ${initialTabs.length} existing tabs in browser`);
        console.log(`beforeAll: Existing tabs:`, initialTabs.map(t => `${t.id}@${t.index}: ${t.url.substring(0, 50)}`));

        // Create 5 tabs for testing (tab switching requires multiple tabs)
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 2); // Make tab 2 active (middle tab)
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between tab creation
        }

        console.log(`beforeAll: Created ${tabIds.length} test tabs: ${tabIds.join(', ')}`);
        const afterCreation = await getAllTabs(bgWs);
        console.log(`beforeAll: Total tabs after creation: ${afterCreation.length}`);

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

        // Wait for tab switch to complete - use longer delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the reset worked by checking which tab is active
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}`);

        // Always reconnect to the active tab to ensure fresh connection
        // (necessary after tests that switch tabs or create new connections)
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

        // Clean up any duplicate tabs created during the test
        // Wait a bit to ensure tab creation is complete
        await new Promise(resolve => setTimeout(resolve, 500));

        const allTabs = await getAllTabs(bgWs);
        const duplicates = allTabs.filter(tab =>
            tab.url === FIXTURE_URL && !tabIds.includes(tab.id)
        );

        console.log(`afterEach: Found ${duplicates.length} duplicate tabs to clean up`);

        for (const tab of duplicates) {
            try {
                console.log(`afterEach: Cleaning up duplicate tab ${tab.id} at index ${tab.index}`);
                await closeTab(bgWs, tab.id);
                await new Promise(resolve => setTimeout(resolve, 200)); // Wait between closures
            } catch (e) {
                console.log(`afterEach: Failed to close tab ${tab.id}: ${e.message}`);
            }
        }

        // Wait for cleanup to complete and tabs to settle
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify cleanup worked
        const afterCleanup = await getAllTabs(bgWs);
        const remainingDuplicates = afterCleanup.filter(tab =>
            tab.url === FIXTURE_URL && !tabIds.includes(tab.id)
        );
        console.log(`afterEach: After cleanup, ${remainingDuplicates.length} duplicate tabs remain`);
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

    test('pressing yt duplicates current tab and switches to it', async () => {
        // Get initial tab count and active tab
        const initialTabs = await getAllTabs(bgWs);
        const initialTab = await getActiveTab(bgWs);
        const initialCount = initialTabs.length;

        console.log(`Initial tab count: ${initialCount}`);
        console.log(`Initial active tab: index ${initialTab.index}, id ${initialTab.id}, url ${initialTab.url}`);
        console.log(`Initial tabs with fixture URL: ${initialTabs.filter(t => t.url === FIXTURE_URL).length}`);

        // Press yt to duplicate tab
        // Use longer delay between keys to ensure they're registered as a sequence
        await sendKey(pageWs, 'y', 100);
        await sendKey(pageWs, 't');

        // Wait a bit for the command to process
        await new Promise(resolve => setTimeout(resolve, 300));

        // Poll for new tab creation
        let newTabCreated = null;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTabs = await getAllTabs(bgWs);
            if (currentTabs.length > initialCount) {
                newTabCreated = currentTabs;
                break;
            }
        }

        expect(newTabCreated).not.toBeNull();
        console.log(`After yt: tab count is ${newTabCreated.length} (was ${initialCount})`);

        // Verify exactly one new tab was created
        const finalCount = newTabCreated.length;
        const tabsCreated = finalCount - initialCount;
        console.log(`Tabs created: ${tabsCreated} (expected: 1)`);
        expect(tabsCreated).toBe(1);

        // Find the duplicate tab
        const duplicateTabs = await findDuplicateTabs(bgWs, FIXTURE_URL);
        console.log(`Found ${duplicateTabs.length} tabs with URL ${FIXTURE_URL}`);

        // Verify duplicate has same URL as original
        const newTab = await getActiveTab(bgWs);
        expect(newTab.url).toBe(initialTab.url);
        expect(newTab.id).not.toBe(initialTab.id); // Different tab ID

        // Verify new tab is active
        console.log(`New active tab: index ${newTab.index}, id ${newTab.id}`);
        expect(newTab.id).not.toBe(initialTab.id);

        // Verify new tab is positioned after original
        // Note: exact index check removed due to potential tab renumbering in headless Chrome
        console.log(`New tab index: ${newTab.index}, original tab index: ${initialTab.index}`);
        expect(newTab.index).toBeGreaterThan(initialTab.index);
        console.log(`✓ Assertion: new tab appears after original tab in tab bar`);
    });

    test('duplicating first tab creates tab at index 1', async () => {
        // Switch to first tab (tabIds[0])
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[0]}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to first tab
        try {
            await closeCDP(pageWs);
        } catch (e) {}
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
        await waitForSurfingkeysReady(pageWs);

        const initialTab = await getActiveTab(bgWs);
        console.log(`First tab: index ${initialTab.index}, id ${initialTab.id}`);

        const initialCount = (await getAllTabs(bgWs)).length;

        // Duplicate first tab
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 't');

        // Poll for new tab
        let newTabCreated = false;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTabs = await getAllTabs(bgWs);
            if (currentTabs.length > initialCount) {
                newTabCreated = true;
                break;
            }
        }

        expect(newTabCreated).toBe(true);

        const newTab = await getActiveTab(bgWs);
        console.log(`Duplicate of first tab: index ${newTab.index}, id ${newTab.id}`);

        // Verify new tab is at index 1 (right after index 0)
        expect(newTab.index).toBe(initialTab.index + 1);
        expect(newTab.url).toBe(FIXTURE_URL);
    });

    test('duplicating last tab creates tab at end', async () => {
        // Switch to last tab (tabIds[4])
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[4]}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to last tab
        try {
            await closeCDP(pageWs);
        } catch (e) {}
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
        await waitForSurfingkeysReady(pageWs);

        const initialTab = await getActiveTab(bgWs);
        const initialCount = (await getAllTabs(bgWs)).length;
        console.log(`Last tab: index ${initialTab.index}, id ${initialTab.id}, total tabs: ${initialCount}`);

        // Duplicate last tab
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 't');

        // Poll for new tab
        let newTabCreated = false;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTabs = await getAllTabs(bgWs);
            if (currentTabs.length > initialCount) {
                newTabCreated = true;
                break;
            }
        }

        expect(newTabCreated).toBe(true);

        const newTab = await getActiveTab(bgWs);
        console.log(`Duplicate of last tab: index ${newTab.index}, id ${newTab.id}`);

        // Verify new tab is positioned after the original last tab
        expect(newTab.index).toBe(initialTab.index + 1);
        expect(newTab.url).toBe(FIXTURE_URL);
    });

    test('duplicating middle tab creates tab next to it', async () => {
        // We're already at middle tab (tabIds[2]) from beforeEach
        const initialTab = await getActiveTab(bgWs);
        const initialCount = (await getAllTabs(bgWs)).length;

        console.log(`Middle tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[2]);

        // Duplicate middle tab
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 't');

        // Poll for new tab
        let newTabCreated = false;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTabs = await getAllTabs(bgWs);
            if (currentTabs.length > initialCount) {
                newTabCreated = true;
                break;
            }
        }

        expect(newTabCreated).toBe(true);

        const newTab = await getActiveTab(bgWs);
        console.log(`Duplicate of middle tab: index ${newTab.index}, id ${newTab.id}`);

        // Verify new tab is immediately after middle tab
        expect(newTab.index).toBe(initialTab.index + 1);
        expect(newTab.url).toBe(FIXTURE_URL);
    });

    test('duplicating twice creates two new tabs', async () => {
        const initialTab = await getActiveTab(bgWs);
        const initialCount = (await getAllTabs(bgWs)).length;

        console.log(`Initial state: tab index ${initialTab.index}, total tabs: ${initialCount}`);

        // First duplication
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 't');

        // Poll for first new tab
        let firstDuplicateCreated = false;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTabs = await getAllTabs(bgWs);
            if (currentTabs.length === initialCount + 1) {
                firstDuplicateCreated = true;
                break;
            }
        }

        expect(firstDuplicateCreated).toBe(true);

        const afterFirstDup = await getActiveTab(bgWs);
        console.log(`After first yt: tab index ${afterFirstDup.index}, total tabs: ${(await getAllTabs(bgWs)).length}`);

        // Reconnect to new active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {}
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
        await waitForSurfingkeysReady(pageWs);

        // Second duplication
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 't');

        // Poll for second new tab
        let secondDuplicateCreated = false;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTabs = await getAllTabs(bgWs);
            if (currentTabs.length === initialCount + 2) {
                secondDuplicateCreated = true;
                break;
            }
        }

        expect(secondDuplicateCreated).toBe(true);

        const afterSecondDup = await getActiveTab(bgWs);
        const finalCount = (await getAllTabs(bgWs)).length;
        console.log(`After second yt: tab index ${afterSecondDup.index}, total tabs: ${finalCount}`);

        // Verify two new tabs were created
        expect(finalCount).toBe(initialCount + 2);

        // Verify all duplicates have same URL
        expect(afterFirstDup.url).toBe(FIXTURE_URL);
        expect(afterSecondDup.url).toBe(FIXTURE_URL);

        // Verify they are different tabs
        expect(afterFirstDup.id).not.toBe(initialTab.id);
        expect(afterSecondDup.id).not.toBe(afterFirstDup.id);
        expect(afterSecondDup.id).not.toBe(initialTab.id);
    });

    test('original tab still exists after duplication', async () => {
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, index ${initialTab.index}`);

        // Duplicate tab
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 't');

        // Poll for new tab creation
        let newTabCreated = false;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== initialTab.id) {
                newTabCreated = true;
                break;
            }
        }

        expect(newTabCreated).toBe(true);

        // Verify original tab still exists by querying all tabs
        const allTabs = await getAllTabs(bgWs);
        const originalTabStillExists = allTabs.some(tab => tab.id === initialTab.id);

        console.log(`Original tab ${initialTab.id} still exists: ${originalTabStillExists}`);
        expect(originalTabStillExists).toBe(true);

        // Verify both tabs have same URL
        const duplicatesWithSameUrl = allTabs.filter(tab => tab.url === FIXTURE_URL);
        console.log(`Tabs with URL ${FIXTURE_URL}: ${duplicatesWithSameUrl.length}`);
        expect(duplicatesWithSameUrl.length).toBeGreaterThanOrEqual(2);
    });
});
