/**
 * CDP Test: cmd_tab_duplicate_background
 *
 * Focused observability test for the tab duplicate background command.
 * - Single command: cmd_tab_duplicate_background
 * - Single key: 'yT'
 * - Single behavior: duplicate current tab WITHOUT switching to it (stay on original)
 * - Focus: verify command execution, tab duplication, and that original tab remains active
 *
 * Key difference from cmd_tab_duplicate (yt):
 * - yt: duplicates tab and switches to the new duplicate
 * - yT: duplicates tab but stays on the original tab (background duplication)
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-duplicate-background.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-tab-duplicate-background.test.ts
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

describe('cmd_tab_duplicate_background', () => {
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

    test('pressing yT duplicates current tab but stays on original (background mode)', async () => {
        // Add small delay to ensure setup from beforeEach is fully stable
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get initial tab count and active tab
        const initialTabs = await getAllTabs(bgWs);
        const initialTab = await getActiveTab(bgWs);
        const initialCount = initialTabs.length;

        console.log(`Initial tab count: ${initialCount}`);
        console.log(`Initial active tab: index ${initialTab.index}, id ${initialTab.id}, url ${initialTab.url}`);
        console.log(`Initial tabs with fixture URL: ${initialTabs.filter(t => t.url === FIXTURE_URL).length}`);

        // Press yT to duplicate tab in background
        // Note: yT is lowercase y followed by uppercase T
        // sendKey automatically adds Shift modifier for uppercase letters
        console.log(`About to send 'y' key...`);
        await sendKey(pageWs, 'y', 100);
        console.log(`Sent 'y' key, about to send 'T' key...`);
        await sendKey(pageWs, 'T');
        console.log(`Sent 'T' key, command should be 'yT'`);

        // Wait a bit for the command to process
        await new Promise(resolve => setTimeout(resolve, 300));

        // Poll for new tab
        let newTabCreated = false;
        let pollAttempt = 0;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTabs = await getAllTabs(bgWs);
            pollAttempt = i + 1;
            if (currentTabs.length > initialCount) {
                newTabCreated = true;
                console.log(`New tab detected after ${pollAttempt} poll attempts (${pollAttempt * 100}ms)`);
                break;
            }
        }

        expect(newTabCreated).toBe(true);
        console.log(`New tab was created successfully`);

        // Verify original tab is STILL ACTIVE (key difference from yt)
        const currentActiveTab = await getActiveTab(bgWs);
        console.log(`Active tab after yT: index ${currentActiveTab.index}, id ${currentActiveTab.id}`);
        console.log(`Original tab: index ${initialTab.index}, id ${initialTab.id}`);
        console.log(`Tab IDs match: ${currentActiveTab.id === initialTab.id}`);

        // Get all tabs to see what's there
        const allTabsDebug = await getAllTabs(bgWs);
        console.log(`All tabs after yT:`, allTabsDebug.map(t => `id=${t.id}, index=${t.index}, url=${t.url.substring(0, 40)}`));

        expect(currentActiveTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: original tab (${initialTab.id}) is still active`);

        // Verify exactly one new tab was created
        const allTabsNow = await getAllTabs(bgWs);
        const finalCount = allTabsNow.length;
        const tabsCreated = finalCount - initialCount;
        console.log(`Tabs created: ${tabsCreated} (expected: 1)`);
        expect(tabsCreated).toBe(1);

        // Find the duplicate tab
        const duplicateTabs = await findDuplicateTabs(bgWs, FIXTURE_URL);
        console.log(`Found ${duplicateTabs.length} tabs with URL ${FIXTURE_URL}`);

        // Verify duplicate exists and is NOT active
        const allTabs = await getAllTabs(bgWs);
        const newDuplicateTab = allTabs.find(tab =>
            tab.url === FIXTURE_URL &&
            tab.id !== initialTab.id &&
            !tabIds.includes(tab.id)
        );

        expect(newDuplicateTab).not.toBeUndefined();
        console.log(`New duplicate tab: index ${newDuplicateTab.index}, id ${newDuplicateTab.id}`);

        // Verify duplicate has same URL as original
        expect(newDuplicateTab.url).toBe(initialTab.url);
        expect(newDuplicateTab.id).not.toBe(initialTab.id); // Different tab ID

        // Verify new tab is positioned after original
        expect(newDuplicateTab.index).toBe(initialTab.index + 1);
        console.log(`✓ Assertion: new duplicate tab appears after original tab in tab bar`);
    });

    test('duplicating first tab in background keeps first tab active', async () => {
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

        // Duplicate first tab in background
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 'T');

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

        // Verify first tab is STILL active
        const currentActiveTab = await getActiveTab(bgWs);
        console.log(`Active tab after yT: index ${currentActiveTab.index}, id ${currentActiveTab.id}`);
        expect(currentActiveTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: original first tab (${initialTab.id}) is still active`);

        // Find the duplicate
        const allTabs = await getAllTabs(bgWs);
        const duplicate = allTabs.find(tab =>
            tab.url === FIXTURE_URL &&
            tab.id !== initialTab.id &&
            !tabIds.includes(tab.id)
        );

        expect(duplicate).not.toBeUndefined();
        console.log(`Duplicate of first tab: index ${duplicate.index}, id ${duplicate.id}`);

        // Verify duplicate is at index 1 (right after index 0)
        expect(duplicate.index).toBe(initialTab.index + 1);
        expect(duplicate.url).toBe(FIXTURE_URL);
    });

    test('duplicating last tab in background keeps last tab active', async () => {
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

        // Duplicate last tab in background
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 'T');

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

        // Verify last tab is STILL active
        const currentActiveTab = await getActiveTab(bgWs);
        console.log(`Active tab after yT: index ${currentActiveTab.index}, id ${currentActiveTab.id}`);
        expect(currentActiveTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: original last tab (${initialTab.id}) is still active`);

        // Find the duplicate
        const allTabs = await getAllTabs(bgWs);
        const duplicate = allTabs.find(tab =>
            tab.url === FIXTURE_URL &&
            tab.id !== initialTab.id &&
            !tabIds.includes(tab.id)
        );

        expect(duplicate).not.toBeUndefined();
        console.log(`Duplicate of last tab: index ${duplicate.index}, id ${duplicate.id}`);

        // Verify duplicate is positioned after the original last tab
        expect(duplicate.index).toBe(initialTab.index + 1);
        expect(duplicate.url).toBe(FIXTURE_URL);
    });

    test('duplicating middle tab in background keeps middle tab active', async () => {
        // We're already at middle tab (tabIds[2]) from beforeEach
        const initialTab = await getActiveTab(bgWs);
        const initialCount = (await getAllTabs(bgWs)).length;

        console.log(`Middle tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[2]);

        // Duplicate middle tab in background
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 'T');

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

        // Verify middle tab is STILL active
        const currentActiveTab = await getActiveTab(bgWs);
        console.log(`Active tab after yT: index ${currentActiveTab.index}, id ${currentActiveTab.id}`);
        expect(currentActiveTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: original middle tab (${initialTab.id}) is still active`);

        // Find the duplicate
        const allTabs = await getAllTabs(bgWs);
        const duplicate = allTabs.find(tab =>
            tab.url === FIXTURE_URL &&
            tab.id !== initialTab.id &&
            !tabIds.includes(tab.id)
        );

        expect(duplicate).not.toBeUndefined();
        console.log(`Duplicate of middle tab: index ${duplicate.index}, id ${duplicate.id}`);

        // Verify duplicate is immediately after middle tab
        expect(duplicate.index).toBe(initialTab.index + 1);
        expect(duplicate.url).toBe(FIXTURE_URL);
    });

    test('duplicating twice in background creates two new tabs and stays on original', async () => {
        const initialTab = await getActiveTab(bgWs);
        const initialCount = (await getAllTabs(bgWs)).length;

        console.log(`Initial state: tab index ${initialTab.index}, id ${initialTab.id}, total tabs: ${initialCount}`);

        // First duplication
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 'T');

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

        // Verify we're still on original tab after first duplication
        const afterFirstDup = await getActiveTab(bgWs);
        console.log(`After first yT: active tab index ${afterFirstDup.index}, id ${afterFirstDup.id}, total tabs: ${(await getAllTabs(bgWs)).length}`);
        expect(afterFirstDup.id).toBe(initialTab.id);
        console.log(`✓ Assertion: still on original tab after first duplication`);

        // Second duplication (still from original tab)
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 'T');

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

        // Verify we're STILL on original tab after second duplication
        const afterSecondDup = await getActiveTab(bgWs);
        const finalCount = (await getAllTabs(bgWs)).length;
        console.log(`After second yT: active tab index ${afterSecondDup.index}, id ${afterSecondDup.id}, total tabs: ${finalCount}`);
        expect(afterSecondDup.id).toBe(initialTab.id);
        console.log(`✓ Assertion: still on original tab after second duplication`);

        // Verify two new tabs were created
        expect(finalCount).toBe(initialCount + 2);

        // Find all duplicates
        const allTabs = await getAllTabs(bgWs);
        const duplicates = allTabs.filter(tab =>
            tab.url === FIXTURE_URL &&
            tab.id !== initialTab.id &&
            !tabIds.includes(tab.id)
        );

        console.log(`Found ${duplicates.length} duplicate tabs`);
        expect(duplicates.length).toBe(2);

        // Verify all duplicates have same URL
        duplicates.forEach(dup => {
            expect(dup.url).toBe(FIXTURE_URL);
            console.log(`Duplicate tab: index ${dup.index}, id ${dup.id}`);
        });

        // Verify they are all different tabs
        expect(duplicates[0].id).not.toBe(initialTab.id);
        expect(duplicates[1].id).not.toBe(initialTab.id);
        expect(duplicates[0].id).not.toBe(duplicates[1].id);
    });

    test('original tab still exists after background duplication', async () => {
        const initialTab = await getActiveTab(bgWs);
        const initialCount = (await getAllTabs(bgWs)).length;
        console.log(`Initial tab: id ${initialTab.id}, index ${initialTab.index}, total tabs: ${initialCount}`);

        // Duplicate tab in background
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 'T');

        // Poll for new tab creation (but active tab should NOT change)
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

        // Verify original tab is still active
        const currentActiveTab = await getActiveTab(bgWs);
        expect(currentActiveTab.id).toBe(initialTab.id);
        console.log(`✓ Original tab ${initialTab.id} is still active`);

        // Verify original tab still exists by querying all tabs
        const allTabs = await getAllTabs(bgWs);
        const originalTabStillExists = allTabs.some(tab => tab.id === initialTab.id);

        console.log(`Original tab ${initialTab.id} still exists: ${originalTabStillExists}`);
        expect(originalTabStillExists).toBe(true);

        // Verify both tabs have same URL
        const duplicatesWithSameUrl = allTabs.filter(tab => tab.url === FIXTURE_URL);
        console.log(`Tabs with URL ${FIXTURE_URL}: ${duplicatesWithSameUrl.length}`);
        expect(duplicatesWithSameUrl.length).toBeGreaterThanOrEqual(2);

        const finalCount = allTabs.length;
        console.log(`Final tab count: ${finalCount} (was ${initialCount}, created 1 new)`);
        expect(finalCount).toBe(initialCount + 1);
    });

    test('difference from yt: yT stays on original while yt switches to duplicate', async () => {
        // This test documents the behavioral difference between yt and yT
        const initialTab = await getActiveTab(bgWs);
        const initialCount = (await getAllTabs(bgWs)).length;

        console.log(`\n=== TESTING yT (background duplication) ===`);
        console.log(`Initial tab: id ${initialTab.id}, index ${initialTab.index}`);

        // Execute yT (duplicate in background)
        await sendKey(pageWs, 'y', 50);
        await sendKey(pageWs, 'T');

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

        // The key assertion: active tab should STILL be the original
        const activeAfterYT = await getActiveTab(bgWs);
        console.log(`Active tab after yT: id ${activeAfterYT.id}, index ${activeAfterYT.index}`);
        expect(activeAfterYT.id).toBe(initialTab.id);
        console.log(`✓ yT behavior: STAYS on original tab (id ${initialTab.id})`);

        // Find the duplicate
        const allTabs = await getAllTabs(bgWs);
        const duplicate = allTabs.find(tab =>
            tab.url === FIXTURE_URL &&
            tab.id !== initialTab.id &&
            !tabIds.includes(tab.id)
        );

        expect(duplicate).not.toBeUndefined();
        console.log(`Duplicate created at: id ${duplicate.id}, index ${duplicate.index}`);
        console.log(`✓ Duplicate exists but is NOT active`);

        // Document expected behavior
        console.log(`\n=== BEHAVIORAL DIFFERENCE ===`);
        console.log(`yT (background): creates duplicate, STAYS on original (tested here)`);
        console.log(`yt (foreground): creates duplicate, SWITCHES to new tab (see cmd-tab-duplicate.test.ts)`);
        console.log(`\n=== ASSERTION SUMMARY ===`);
        console.log(`✓ New tab created: ${duplicate.id !== initialTab.id}`);
        console.log(`✓ Original tab still active: ${activeAfterYT.id === initialTab.id}`);
        console.log(`✓ Duplicate is in background (not active): ${duplicate.id !== activeAfterYT.id}`);
    });
});
