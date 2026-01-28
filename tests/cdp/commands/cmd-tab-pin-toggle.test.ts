/**
 * CDP Test: cmd_tab_pin_toggle
 *
 * Focused observability test for the tab pin toggle command.
 * - Single command: cmd_tab_pin_toggle
 * - Single key: '<Alt-p>'
 * - Single behavior: toggle pin status of current tab
 * - Focus: verify command execution and pin state changes via chrome.tabs API
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-pin-toggle.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-pin-toggle.test.ts
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
 * Get the pin status of a specific tab by ID
 */
async function getTabPinStatus(bgWs: WebSocket, tabId: number): Promise<boolean> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${tabId}, (tab) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve(tab.pinned);
                }
            });
        })
    `);
    return result;
}

/**
 * Get the currently active tab with pin status
 */
async function getActiveTab(bgWs: WebSocket): Promise<{ id: number; index: number; url: string; pinned: boolean }> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    resolve({
                        id: tabs[0].id,
                        index: tabs[0].index,
                        url: tabs[0].url,
                        pinned: tabs[0].pinned
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
 * Poll for tab pin status change
 */
async function pollForPinChange(bgWs: WebSocket, tabId: number, expectedPinned: boolean, maxAttempts: number = 20): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const pinned = await getTabPinStatus(bgWs, tabId);
        if (pinned === expectedPinned) {
            return true;
        }
    }
    return false;
}

/**
 * Unpin a tab by ID (helper for beforeEach cleanup)
 */
async function unpinTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.update(${tabId}, { pinned: false }, () => {
                resolve(true);
            });
        })
    `);
}

describe('cmd_tab_pin_toggle', () => {
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

        // Create 5 tabs for testing
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
        // Unpin all tabs before each test to ensure clean state
        for (const tabId of tabIds) {
            await unpinTab(bgWs, tabId);
        }
        console.log(`beforeEach: Unpinned all test tabs`);

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
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}, pinned: ${verifyTab.pinned}`);

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

    test('pressing Alt-p pins an unpinned tab', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, pinned: ${initialTab.pinned}`);

        // Verify tab starts unpinned
        expect(initialTab.pinned).toBe(false);

        // Press Alt-p to pin tab
        await sendKey(pageWs, 'Alt+p');

        // Poll for pin status change
        const pinChanged = await pollForPinChange(bgWs, initialTab.id, true);
        expect(pinChanged).toBe(true);

        // Verify tab is now pinned
        const finalPinned = await getTabPinStatus(bgWs, initialTab.id);
        console.log(`After Alt-p: tab ${initialTab.id} pinned: ${finalPinned}`);
        expect(finalPinned).toBe(true);
    });

    test('pressing Alt-p unpins a pinned tab', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, pinned: ${initialTab.pinned}`);

        // First, pin the tab manually
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${initialTab.id}, { pinned: true }, () => {
                    resolve(true);
                });
            })
        `);

        // Wait for pin to take effect
        await pollForPinChange(bgWs, initialTab.id, true);
        const pinnedStatus = await getTabPinStatus(bgWs, initialTab.id);
        console.log(`After manual pin: tab ${initialTab.id} pinned: ${pinnedStatus}`);
        expect(pinnedStatus).toBe(true);

        // Press Alt-p to unpin tab
        await sendKey(pageWs, 'Alt+p');

        // Poll for pin status change
        const unpinChanged = await pollForPinChange(bgWs, initialTab.id, false);
        expect(unpinChanged).toBe(true);

        // Verify tab is now unpinned
        const finalPinned = await getTabPinStatus(bgWs, initialTab.id);
        console.log(`After Alt-p: tab ${initialTab.id} pinned: ${finalPinned}`);
        expect(finalPinned).toBe(false);
    });

    test('pressing Alt-p twice toggles pin state back to original', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, initial pinned: ${initialTab.pinned}`);

        // Verify starts unpinned
        expect(initialTab.pinned).toBe(false);

        // First Alt-p: pin the tab
        await sendKey(pageWs, 'Alt+p');
        await pollForPinChange(bgWs, initialTab.id, true);
        const afterFirstToggle = await getTabPinStatus(bgWs, initialTab.id);
        console.log(`After first Alt-p: tab ${initialTab.id} pinned: ${afterFirstToggle}`);
        expect(afterFirstToggle).toBe(true);

        // Second Alt-p: unpin the tab
        await sendKey(pageWs, 'Alt+p');
        await pollForPinChange(bgWs, initialTab.id, false);
        const afterSecondToggle = await getTabPinStatus(bgWs, initialTab.id);
        console.log(`After second Alt-p: tab ${initialTab.id} pinned: ${afterSecondToggle}`);
        expect(afterSecondToggle).toBe(false);

        // Verify we're back to original state
        expect(afterSecondToggle).toBe(initialTab.pinned);
    });

    test('pinning a tab moves it to the beginning (index 0)', async () => {
        // Get initial active tab (should be tabIds[2] from beforeEach)
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, index ${initialTab.index}, pinned: ${initialTab.pinned}`);

        // Verify we're at the middle tab
        expect(initialTab.id).toBe(tabIds[2]);
        expect(initialTab.pinned).toBe(false);

        // Press Alt-p to pin tab
        await sendKey(pageWs, 'Alt+p');

        // Poll for pin status change
        await pollForPinChange(bgWs, initialTab.id, true);

        // Wait a bit more for tab reordering to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get updated tab info
        const pinnedTab = await getActiveTab(bgWs);
        console.log(`After Alt-p: tab ${pinnedTab.id}, index ${pinnedTab.index}, pinned: ${pinnedTab.pinned}`);

        // Verify tab is pinned and moved to index 0
        expect(pinnedTab.id).toBe(initialTab.id);
        expect(pinnedTab.pinned).toBe(true);
        expect(pinnedTab.index).toBe(0);
    });

    test('only current tab is affected, other tabs remain unpinned', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, index ${initialTab.index}`);

        // Verify all tabs start unpinned
        for (const tabId of tabIds) {
            const pinned = await getTabPinStatus(bgWs, tabId);
            expect(pinned).toBe(false);
        }
        console.log(`✓ All tabs confirmed unpinned before test`);

        // Press Alt-p to pin current tab
        await sendKey(pageWs, 'Alt+p');

        // Poll for pin status change on current tab
        await pollForPinChange(bgWs, initialTab.id, true);

        // Verify only current tab is pinned
        for (const tabId of tabIds) {
            const pinned = await getTabPinStatus(bgWs, tabId);
            if (tabId === initialTab.id) {
                console.log(`Current tab ${tabId}: pinned=${pinned} (expected: true)`);
                expect(pinned).toBe(true);
            } else {
                console.log(`Other tab ${tabId}: pinned=${pinned} (expected: false)`);
                expect(pinned).toBe(false);
            }
        }
    });

    test('toggling pin on already pinned tab works correctly', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}`);

        // Manually pin the tab first
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${initialTab.id}, { pinned: true }, () => {
                    resolve(true);
                });
            })
        `);
        await pollForPinChange(bgWs, initialTab.id, true);
        console.log(`Tab ${initialTab.id} manually pinned`);

        // Verify it's pinned
        const beforeToggle = await getTabPinStatus(bgWs, initialTab.id);
        expect(beforeToggle).toBe(true);

        // Press Alt-p to unpin (edge case: toggling already pinned tab)
        await sendKey(pageWs, 'Alt+p');

        // Poll for unpin
        await pollForPinChange(bgWs, initialTab.id, false);

        // Verify it's now unpinned
        const afterToggle = await getTabPinStatus(bgWs, initialTab.id);
        console.log(`After Alt-p on already pinned tab: pinned=${afterToggle}`);
        expect(afterToggle).toBe(false);
    });

    test('multiple rapid toggles work correctly', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, initial pinned: ${initialTab.pinned}`);

        // Verify starts unpinned
        expect(initialTab.pinned).toBe(false);

        // Toggle 1: pin
        await sendKey(pageWs, 'Alt+p');
        await pollForPinChange(bgWs, initialTab.id, true);
        const after1 = await getTabPinStatus(bgWs, initialTab.id);
        expect(after1).toBe(true);
        console.log(`Toggle 1: pinned=${after1}`);

        // Toggle 2: unpin
        await sendKey(pageWs, 'Alt+p');
        await pollForPinChange(bgWs, initialTab.id, false);
        const after2 = await getTabPinStatus(bgWs, initialTab.id);
        expect(after2).toBe(false);
        console.log(`Toggle 2: pinned=${after2}`);

        // Toggle 3: pin again
        await sendKey(pageWs, 'Alt+p');
        await pollForPinChange(bgWs, initialTab.id, true);
        const after3 = await getTabPinStatus(bgWs, initialTab.id);
        expect(after3).toBe(true);
        console.log(`Toggle 3: pinned=${after3}`);

        // Toggle 4: unpin again
        await sendKey(pageWs, 'Alt+p');
        await pollForPinChange(bgWs, initialTab.id, false);
        const after4 = await getTabPinStatus(bgWs, initialTab.id);
        expect(after4).toBe(false);
        console.log(`Toggle 4: pinned=${after4}`);

        // Verify final state matches initial state
        expect(after4).toBe(initialTab.pinned);
    });
});
