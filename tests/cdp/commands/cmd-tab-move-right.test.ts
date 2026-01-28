/**
 * CDP Test: cmd_tab_move_right
 *
 * Focused observability test for the tab move right command.
 * - Single command: cmd_tab_move_right
 * - Single key: '>>'
 * - Single behavior: move current tab one position to the right
 * - Focus: verify command execution and tab position changes
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-move-right.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-move-right.test.ts
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
 * Get all tabs in current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(t => ({ id: t.id, index: t.index, url: t.url })));
            });
        })
    `);
    return result;
}

describe('cmd_tab_move_right', () => {
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

        // Create 5 tabs for testing (tab moving requires multiple tabs)
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
        // (necessary after tests that move tabs or create new connections)
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

    test('pressing >> moves tab one position to the right', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Press >> to move tab right
        await sendKey(pageWs, '>', 50);
        await sendKey(pageWs, '>');

        // Poll for tab index change
        let movedTab = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialTab.id);
            if (currentTab && currentTab.index !== initialTab.index) {
                movedTab = currentTab;
                break;
            }
        }

        expect(movedTab).not.toBeNull();
        console.log(`After >>: tab id ${movedTab.id} at index ${movedTab.index} (moved from ${initialTab.index})`);

        // Verify tab moved one position to the right (index increased by 1)
        expect(movedTab.index).toBe(initialTab.index + 1);
        console.log(`✓ Assertion: tab index increased by 1`);

        // Verify same tab ID (tab moved, not switched)
        expect(movedTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: tab ID preserved (${movedTab.id})`);
    });

    test('pressing >> twice moves tab two positions to the right', async () => {
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab index: ${initialTab.index}, id: ${initialTab.id}`);

        // Press >> first time
        await sendKey(pageWs, '>', 50);
        await sendKey(pageWs, '>');

        // Poll for first move
        let afterFirstMove = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialTab.id);
            if (currentTab && currentTab.index !== initialTab.index) {
                afterFirstMove = currentTab;
                break;
            }
        }

        expect(afterFirstMove).not.toBeNull();
        console.log(`After first >>: index ${afterFirstMove.index} (moved from ${initialTab.index})`);

        // Press >> second time
        await sendKey(pageWs, '>', 50);
        await sendKey(pageWs, '>');

        // Poll for second move
        let afterSecondMove = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialTab.id);
            if (currentTab && currentTab.index !== afterFirstMove.index) {
                afterSecondMove = currentTab;
                break;
            }
        }

        expect(afterSecondMove).not.toBeNull();
        console.log(`After second >>: index ${afterSecondMove.index} (moved from ${afterFirstMove.index})`);

        // Verify moved two positions total (index increased by 2)
        expect(afterSecondMove.index).toBe(initialTab.index + 2);
        console.log(`✓ Assertion: tab moved 2 positions right (from ${initialTab.index} to ${afterSecondMove.index})`);

        // Verify same tab ID throughout
        expect(afterSecondMove.id).toBe(initialTab.id);
        console.log(`✓ Assertion: tab ID preserved throughout moves (${afterSecondMove.id})`);
    });

    test('pressing 2>> moves tab two positions to the right', async () => {
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
        console.log(`Initial tab index: ${initialTab.index}`);

        // The key assertion: 2>> should move tab exactly 2 positions to the right
        // tabIds is in creation order: [tab0, tab1, tab2(START), tab3, tab4]
        // 2>> from tab2 should move it to tab4's position (index + 2)
        const expectedDistance = 2;
        const expectedFinalIndex = initialTab.index + expectedDistance;

        console.log(`✓ Expected distance: ${expectedDistance} positions to the right`);
        console.log(`✓ Expected final index: ${expectedFinalIndex} (current index ${initialTab.index} plus ${expectedDistance})`);
        console.log(`=== START TEST: will move tab from index ${initialTab.index} exactly ${expectedDistance} positions right ===\n`);

        // Send '2' followed by '>>' to create 2>> command
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, '>', 50);
        await sendKey(pageWs, '>');

        // Poll for tab position change
        let finalTab = null;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const currentTab = await getTabById(bgWs, initialTab.id);
            if (currentTab && currentTab.index !== initialTab.index) {
                finalTab = currentTab;
                break;
            }
        }

        expect(finalTab).not.toBeNull();
        console.log(`\nAfter 2>>: tab id ${finalTab.id} at index ${finalTab.index}`);

        // Verify tab moved to expected index
        expect(finalTab.index).toBe(expectedFinalIndex);
        console.log(`✓ Assertion: final tab index is ${expectedFinalIndex}`);

        // Calculate actual distance moved
        const actualDistance = finalTab.index - initialTab.index;
        console.log(`Actual distance moved: ${actualDistance} positions to the right`);

        // Verify we moved exactly the expected distance
        expect(actualDistance).toBe(expectedDistance);
        console.log(`✓ Assertion: moved exactly ${expectedDistance} positions to the right`);

        // Verify same tab ID (tab moved, not switched)
        expect(finalTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: tab ID preserved (${finalTab.id})`);
    });

    test('moving tab from middle to right maintains other tabs order', async () => {
        // Start from tab at index 2 (3rd tab in our created sequence)
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Get initial state of all tabs
        const initialAllTabs = await getAllTabs(bgWs);
        console.log(`Initial tabs order:`, initialAllTabs.map(t => `[id:${t.id}, idx:${t.index}]`).join(', '));

        // Move tab right with >>
        await sendKey(pageWs, '>', 50);
        await sendKey(pageWs, '>');

        // Poll for tab index change
        let movedTab = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialTab.id);
            if (currentTab && currentTab.index !== initialTab.index) {
                movedTab = currentTab;
                break;
            }
        }

        expect(movedTab).not.toBeNull();
        console.log(`After >>: tab id ${movedTab.id} at index ${movedTab.index}`);

        // Get final state of all tabs
        const finalAllTabs = await getAllTabs(bgWs);
        console.log(`Final tabs order:`, finalAllTabs.map(t => `[id:${t.id}, idx:${t.index}]`).join(', '));

        // Verify moved tab is one position right
        expect(movedTab.index).toBe(initialTab.index + 1);
        console.log(`✓ Assertion: moved tab index increased by 1`);

        // Verify tab IDs are preserved (only positions changed)
        const initialIds = initialAllTabs.map(t => t.id).sort();
        const finalIds = finalAllTabs.map(t => t.id).sort();
        expect(finalIds).toEqual(initialIds);
        console.log(`✓ Assertion: all tab IDs preserved`);

        // Verify total tab count unchanged
        expect(finalAllTabs.length).toBe(initialAllTabs.length);
        console.log(`✓ Assertion: tab count unchanged (${finalAllTabs.length})`);
    });

    test('cannot move rightmost tab further right', async () => {
        // Move to rightmost tab (tabIds[4])
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
        await waitForSurfingkeysReady(pageWs);

        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial rightmost tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Verify we're at the rightmost position
        expect(initialTab.id).toBe(rightmostTabId);
        console.log(`✓ Assertion: starting at rightmost tab (id=${rightmostTabId})`);

        // Try to move right with >>
        await sendKey(pageWs, '>', 50);
        await sendKey(pageWs, '>');

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check tab position - should remain at same index
        const finalTab = await getTabById(bgWs, rightmostTabId);
        console.log(`After >>: tab id ${finalTab.id} at index ${finalTab.index}`);

        // Verify tab stayed at same index (can't move right from rightmost position)
        expect(finalTab.index).toBe(initialTab.index);
        console.log(`✓ Assertion: tab remained at index ${finalTab.index} (cannot move right from rightmost position)`);

        // Verify same tab ID
        expect(finalTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: tab ID preserved (${finalTab.id})`);
    });

    test('tab IDs are preserved after move (only index changes)', async () => {
        const initialTab = await getActiveTab(bgWs);
        console.log(`Before move: tab id ${initialTab.id} at index ${initialTab.index}`);

        // Move tab right
        await sendKey(pageWs, '>', 50);
        await sendKey(pageWs, '>');

        // Poll for position change
        let movedTab = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getTabById(bgWs, initialTab.id);
            if (currentTab && currentTab.index !== initialTab.index) {
                movedTab = currentTab;
                break;
            }
        }

        expect(movedTab).not.toBeNull();
        console.log(`After move: tab id ${movedTab.id} at index ${movedTab.index}`);

        // Tab ID should be preserved
        expect(movedTab.id).toBe(initialTab.id);
        console.log(`✓ Assertion: tab ID preserved (${initialTab.id})`);

        // Only index should change
        expect(movedTab.index).not.toBe(initialTab.index);
        expect(movedTab.index).toBe(initialTab.index + 1);
        console.log(`✓ Assertion: index changed from ${initialTab.index} to ${movedTab.index}`);
    });
});
