/**
 * CDP Test: cmd_tab_move_left
 *
 * Focused observability test for the tab move left command.
 * - Single command: cmd_tab_move_left
 * - Single key: '<<'
 * - Single behavior: move current tab one position to the left
 * - Focus: verify command execution and tab position changes
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-move-left.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-move-left.test.ts
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
 * Get tab information by ID
 */
async function getTabById(bgWs: WebSocket, tabId: number): Promise<{ id: number; index: number; url: string } | null> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${tabId}, (tab) => {
                if (chrome.runtime.lastError || !tab) {
                    resolve(null);
                } else {
                    resolve({
                        id: tab.id,
                        index: tab.index,
                        url: tab.url
                    });
                }
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

describe('cmd_tab_move_left', () => {
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

        // Create 5 tabs for testing (moving tabs requires multiple tabs)
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 2); // Make tab 2 active (middle tab)
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between tab creation
        }

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

    test('pressing << moves tab one position to the left', async () => {
        // Get initial state
        const initialTab = await getActiveTab(bgWs);
        const initialIndex = initialTab.index;
        const initialId = initialTab.id;
        console.log(`Initial tab: index ${initialIndex}, id ${initialId}`);

        // Press << to move tab left
        await sendKey(pageWs, '<', 50);
        await sendKey(pageWs, '<');

        // Poll for tab position change
        let movedTab = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialId);
            if (currentTab && currentTab.index !== initialIndex) {
                movedTab = currentTab;
                break;
            }
        }

        expect(movedTab).not.toBeNull();
        console.log(`After <<: tab id ${movedTab.id} moved to index ${movedTab.index}`);

        // Verify tab moved to the left (index decreased by 1)
        expect(movedTab.index).toBe(initialIndex - 1);

        // Verify tab ID is preserved (only position changed)
        expect(movedTab.id).toBe(initialId);
    });

    test('pressing << twice moves tab two positions to the left', async () => {
        const initialTab = await getActiveTab(bgWs);
        const initialIndex = initialTab.index;
        const initialId = initialTab.id;
        console.log(`Initial tab index: ${initialIndex}, id: ${initialId}`);

        // Send first '<<' and wait for position change
        await sendKey(pageWs, '<', 50);
        await sendKey(pageWs, '<');

        // Poll for first move
        let afterFirstMove = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialId);
            if (currentTab && currentTab.index === initialIndex - 1) {
                afterFirstMove = currentTab;
                break;
            }
        }

        expect(afterFirstMove).not.toBeNull();
        console.log(`After first <<: index ${afterFirstMove.index}`);

        // Send second '<<'
        await sendKey(pageWs, '<', 50);
        await sendKey(pageWs, '<');

        // Poll for second move
        let afterSecondMove = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialId);
            if (currentTab && currentTab.index === initialIndex - 2) {
                afterSecondMove = currentTab;
                break;
            }
        }

        expect(afterSecondMove).not.toBeNull();
        console.log(`After second <<: index ${afterSecondMove.index}`);

        // Verify moved exactly 2 positions
        expect(afterSecondMove.index).toBe(initialIndex - 2);
        expect(afterSecondMove.id).toBe(initialId);
    });

    test('pressing 2<< moves tab two positions to the left', async () => {
        // === SETUP VERIFICATION ===
        console.log(`\n=== TEST SETUP STATE ===`);
        console.log(`Total tabs created: ${tabIds.length}`);
        console.log(`Tab IDs: ${tabIds.join(', ')}`);

        // Assert we have 5 tabs as created in beforeAll
        expect(tabIds.length).toBe(5);
        console.log(`✓ Assertion: exactly 5 tabs exist`);

        // Get initial active tab and verify it exists
        const initialTab = await getActiveTab(bgWs);
        console.log(`Current active tab: index ${initialTab.index}, id ${initialTab.id}`);
        console.log(`Is it in our tabIds? ${tabIds.includes(initialTab.id)}`);

        // Assert we have a valid starting state
        expect(initialTab).not.toBeNull();
        console.log(`✓ Assertion: active tab is not null`);

        expect(initialTab.id).toBeDefined();
        console.log(`✓ Assertion: active tab ID is defined`);

        expect(tabIds).toContain(initialTab.id);
        console.log(`✓ Assertion: current tab (id=${initialTab.id}) is in our created tabIds`);

        // beforeEach resets to tabIds[2], verify that happened
        expect(initialTab.id).toBe(tabIds[2]);
        console.log(`✓ Assertion: we are at tabIds[2] (id=${tabIds[2]}), the middle/reset tab`);

        // Log initial tab index for debugging
        const initialIndex = initialTab.index;
        const initialId = initialTab.id;
        console.log(`Initial tab index: ${initialIndex}`);

        // The key assertion: 2<< should move us exactly 2 positions to the left
        const expectedDistance = 2;
        const expectedFinalIndex = initialIndex - expectedDistance;

        console.log(`✓ Expected distance: ${expectedDistance} positions to the left`);
        console.log(`✓ Expected final index: ${expectedFinalIndex} (current index ${initialIndex} minus ${expectedDistance})`);
        console.log(`=== START TEST: will move from index ${initialIndex} exactly ${expectedDistance} positions left ===\n`);

        // Send '2' followed by '<<' to create 2<< command
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, '<', 50);
        await sendKey(pageWs, '<');

        // Poll for tab position change after 2<<
        let finalTab = null;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const currentTab = await getTabById(bgWs, initialId);
            if (currentTab && currentTab.index === expectedFinalIndex) {
                finalTab = currentTab;
                break;
            }
        }

        expect(finalTab).not.toBeNull();
        console.log(`\nAfter 2<<: tab id ${finalTab.id} at index ${finalTab.index}`);

        // Verify final tab index is correct
        expect(finalTab.index).toBe(expectedFinalIndex);
        console.log(`✓ Assertion: final tab index is ${expectedFinalIndex}`);

        // Calculate actual distance moved
        const actualDistance = initialIndex - finalTab.index;
        console.log(`Actual distance moved: ${actualDistance} positions to the left`);

        // Verify we moved exactly the expected distance
        expect(actualDistance).toBe(expectedDistance);
        console.log(`✓ Assertion: moved exactly ${expectedDistance} positions to the left`);

        // Verify tab ID is preserved
        expect(finalTab.id).toBe(initialId);
        console.log(`✓ Assertion: tab ID preserved (${initialId})`);
    });

    test('other tabs maintain relative order after move', async () => {
        // Get initial tab order
        const allTabsBefore = await getAllTabs(bgWs);
        const initialTab = await getActiveTab(bgWs);
        const initialId = initialTab.id;
        const initialIndex = initialTab.index;

        console.log(`\n=== BEFORE MOVE ===`);
        console.log(`All tabs:`, allTabsBefore.map(t => `id=${t.id}, index=${t.index}`));
        console.log(`Active tab: id=${initialId}, index=${initialIndex}`);

        // Move tab left
        await sendKey(pageWs, '<', 50);
        await sendKey(pageWs, '<');

        // Poll for position change
        let movedTab = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialId);
            if (currentTab && currentTab.index !== initialIndex) {
                movedTab = currentTab;
                break;
            }
        }

        expect(movedTab).not.toBeNull();

        // Get tab order after move
        const allTabsAfter = await getAllTabs(bgWs);
        console.log(`\n=== AFTER MOVE ===`);
        console.log(`All tabs:`, allTabsAfter.map(t => `id=${t.id}, index=${t.index}`));
        console.log(`Moved tab: id=${movedTab.id}, index=${movedTab.index}`);

        // Find the tab that was at the left of our moved tab
        const leftNeighborBefore = allTabsBefore.find(t => t.index === initialIndex - 1);
        const leftNeighborAfter = allTabsAfter.find(t => t.id === leftNeighborBefore.id);

        // The tab that was to the left should now be at our old position
        expect(leftNeighborAfter.index).toBe(initialIndex);
        console.log(`✓ Left neighbor moved right: from index ${leftNeighborBefore.index} to ${leftNeighborAfter.index}`);

        // Our tab should be at the left neighbor's old position
        expect(movedTab.index).toBe(leftNeighborBefore.index);
        console.log(`✓ Active tab moved left: from index ${initialIndex} to ${movedTab.index}`);

        // All other tabs should maintain their positions
        for (const tabBefore of allTabsBefore) {
            if (tabBefore.id === initialId || tabBefore.id === leftNeighborBefore.id) {
                continue; // Skip the two swapped tabs
            }
            const tabAfter = allTabsAfter.find(t => t.id === tabBefore.id);
            expect(tabAfter.index).toBe(tabBefore.index);
        }
        console.log(`✓ All other tabs maintained their positions`);
    });

    test('cannot move leftmost tab further left', async () => {
        // Move to leftmost tab (tabIds[0])
        const leftmostTabId = tabIds[0];
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${leftmostTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);

        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to the new active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {}
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
        await waitForSurfingkeysReady(pageWs);

        const initialTab = await getActiveTab(bgWs);
        const initialIndex = initialTab.index;
        const initialId = initialTab.id;

        // Get all tabs to find the minimum index
        const allTabs = await getAllTabs(bgWs);
        const minIndex = Math.min(...allTabs.map(t => t.index));

        console.log(`Initial leftmost tab: index ${initialIndex}, id ${initialId}, minIndex ${minIndex}`);
        expect(initialIndex).toBe(minIndex);

        // Try to move left
        await sendKey(pageWs, '<', 50);
        await sendKey(pageWs, '<');

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check tab position - should be unchanged
        const afterTab = await getTabById(bgWs, initialId);
        console.log(`After << on leftmost tab: index ${afterTab.index}`);

        // Position should not change (still at leftmost position)
        expect(afterTab.index).toBe(initialIndex);
        console.log(`✓ Leftmost tab stayed at index ${afterTab.index}`);
    });

    test('tab IDs are preserved after move (only index changes)', async () => {
        const initialTab = await getActiveTab(bgWs);
        const initialId = initialTab.id;
        const initialIndex = initialTab.index;

        console.log(`Before move: tab id ${initialId} at index ${initialIndex}`);

        // Move tab left
        await sendKey(pageWs, '<', 50);
        await sendKey(pageWs, '<');

        // Poll for position change
        let movedTab = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialId);
            if (currentTab && currentTab.index !== initialIndex) {
                movedTab = currentTab;
                break;
            }
        }

        expect(movedTab).not.toBeNull();
        console.log(`After move: tab id ${movedTab.id} at index ${movedTab.index}`);

        // Tab ID should be preserved
        expect(movedTab.id).toBe(initialId);
        console.log(`✓ Tab ID preserved: ${initialId}`);

        // Only index should change
        expect(movedTab.index).not.toBe(initialIndex);
        expect(movedTab.index).toBe(initialIndex - 1);
        console.log(`✓ Index changed from ${initialIndex} to ${movedTab.index}`);
    });
});
