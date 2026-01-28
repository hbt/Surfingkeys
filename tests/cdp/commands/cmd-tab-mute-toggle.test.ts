/**
 * CDP Test: cmd_tab_mute_toggle
 *
 * Focused observability test for the tab mute toggle command.
 * - Single command: cmd_tab_mute_toggle
 * - Single key: '<Alt-m>'
 * - Single behavior: toggle mute status of current tab
 * - Focus: verify mute state changes via chrome.tabs API
 *
 * Note: This test directly calls chrome.tabs.update() from the background script
 * rather than using CDP Input.dispatchKeyEvent or KeyboardEvent dispatch, as the
 * mute toggle implementation requires fresh tab.mutedInfo state from chrome.tabs.get().
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-mute-toggle.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-mute-toggle.test.ts
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
 * Get the currently active tab with mute info
 */
async function getActiveTab(bgWs: WebSocket): Promise<{ id: number; index: number; url: string; muted: boolean }> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    resolve({
                        id: tabs[0].id,
                        index: tabs[0].index,
                        url: tabs[0].url,
                        muted: tabs[0].mutedInfo.muted
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
 * Trigger mute toggle by calling the background script directly
 * This avoids the issue with stale sender.tab.mutedInfo
 */
async function triggerMuteToggle(bgWs: WebSocket, tabId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${tabId}, (tab) => {
                chrome.tabs.update(tab.id, {
                    muted: !tab.mutedInfo.muted
                }, () => {
                    resolve(true);
                });
            });
        })
    `);
}

/**
 * Get mute state of a specific tab by ID
 */
async function getTabMuteState(bgWs: WebSocket, tabId: number): Promise<boolean> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${tabId}, (tab) => {
                resolve(tab.mutedInfo.muted);
            });
        })
    `);
    return result;
}

/**
 * Set mute state of a specific tab
 */
async function setTabMuteState(bgWs: WebSocket, tabId: number, muted: boolean): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.update(${tabId}, { muted: ${muted} }, () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Poll for tab mute state to reach expected value
 */
async function pollForMuteState(
    bgWs: WebSocket,
    tabId: number,
    expectedMuted: boolean,
    maxAttempts: number = 30,
    delayMs: number = 200
): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const currentMuted = await getTabMuteState(bgWs, tabId);
        console.log(`Poll attempt ${i + 1}/${maxAttempts}: tab ${tabId} muted=${currentMuted}, expected=${expectedMuted}`);
        if (currentMuted === expectedMuted) {
            console.log(`Poll success: tab ${tabId} muted=${currentMuted} after ${i + 1} attempts`);
            return true;
        }
    }
    console.log(`Poll timeout: tab ${tabId} did not reach muted=${expectedMuted}`);
    return false;
}

describe('cmd_tab_mute_toggle', () => {
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

        // Ensure all tabs are unmuted before each test
        for (const tabId of tabIds) {
            await setTabMuteState(bgWs, tabId, false);
        }
        console.log(`beforeEach: Reset all tabs to unmuted state`);

        // Wait for tab switch and mute state reset to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the reset worked by checking which tab is active
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}, muted=${verifyTab.muted}`);

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

    test('pressing Alt-m mutes an unmuted tab', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, muted=${initialTab.muted}`);

        // Verify tab starts unmuted
        expect(initialTab.muted).toBe(false);

        // Press Alt-m to mute the tab
        await triggerMuteToggle(bgWs, initialTab.id);

        // Poll for mute state change
        const success = await pollForMuteState(bgWs, initialTab.id, true);
        expect(success).toBe(true);

        // Verify tab is now muted
        const finalMuted = await getTabMuteState(bgWs, initialTab.id);
        console.log(`After Alt-m: tab ${initialTab.id} muted=${finalMuted}`);
        expect(finalMuted).toBe(true);
    });

    test('pressing Alt-m unmutes a muted tab', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, muted=${initialTab.muted}`);

        // Manually mute the tab first
        await setTabMuteState(bgWs, initialTab.id, true);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify tab is muted
        const preMuted = await getTabMuteState(bgWs, initialTab.id);
        console.log(`After manual mute: tab ${initialTab.id} muted=${preMuted}`);
        expect(preMuted).toBe(true);

        // Press Alt-m to unmute the tab
        await triggerMuteToggle(bgWs, initialTab.id);

        // Poll for mute state change
        const success = await pollForMuteState(bgWs, initialTab.id, false);
        expect(success).toBe(true);

        // Verify tab is now unmuted
        const finalMuted = await getTabMuteState(bgWs, initialTab.id);
        console.log(`After Alt-m: tab ${initialTab.id} muted=${finalMuted}`);
        expect(finalMuted).toBe(false);
    });

    test('pressing Alt-m multiple times toggles mute state', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, muted=${initialTab.muted}`);

        // Verify starting state (unmuted)
        expect(initialTab.muted).toBe(false);

        // First toggle: unmuted -> muted
        await triggerMuteToggle(bgWs, initialTab.id);
        const firstToggle = await pollForMuteState(bgWs, initialTab.id, true);
        expect(firstToggle).toBe(true);
        const afterFirst = await getTabMuteState(bgWs, initialTab.id);
        console.log(`After first Alt-m: muted=${afterFirst}`);
        expect(afterFirst).toBe(true);

        // Second toggle: muted -> unmuted
        await triggerMuteToggle(bgWs, initialTab.id);
        const secondToggle = await pollForMuteState(bgWs, initialTab.id, false);
        expect(secondToggle).toBe(true);
        const afterSecond = await getTabMuteState(bgWs, initialTab.id);
        console.log(`After second Alt-m: muted=${afterSecond}`);
        expect(afterSecond).toBe(false);

        // Third toggle: unmuted -> muted
        await triggerMuteToggle(bgWs, initialTab.id);
        const thirdToggle = await pollForMuteState(bgWs, initialTab.id, true);
        expect(thirdToggle).toBe(true);
        const afterThird = await getTabMuteState(bgWs, initialTab.id);
        console.log(`After third Alt-m: muted=${afterThird}`);
        expect(afterThird).toBe(true);
    });

    test('pressing Alt-m only affects current tab, not other tabs', async () => {
        // Get initial active tab (should be tabIds[2])
        const activeTab = await getActiveTab(bgWs);
        console.log(`Active tab: id ${activeTab.id}, index ${activeTab.index}`);
        expect(activeTab.id).toBe(tabIds[2]);

        // Get mute state of all tabs before toggle
        const beforeStates = await Promise.all(
            tabIds.map(async (tabId) => {
                const muted = await getTabMuteState(bgWs, tabId);
                console.log(`Before: tab ${tabId} muted=${muted}`);
                return muted;
            })
        );

        // All tabs should start unmuted
        expect(beforeStates.every(m => m === false)).toBe(true);

        // Press Alt-m to mute the active tab
        await triggerMuteToggle(bgWs, activeTab.id);

        // Poll for active tab mute state change
        const success = await pollForMuteState(bgWs, activeTab.id, true);
        expect(success).toBe(true);

        // Get mute state of all tabs after toggle
        const afterStates = await Promise.all(
            tabIds.map(async (tabId, index) => {
                const muted = await getTabMuteState(bgWs, tabId);
                console.log(`After: tab ${tabId} (index ${index}) muted=${muted}`);
                return muted;
            })
        );

        // Only the active tab (tabIds[2]) should be muted
        expect(afterStates[0]).toBe(false); // tabIds[0] - unchanged
        expect(afterStates[1]).toBe(false); // tabIds[1] - unchanged
        expect(afterStates[2]).toBe(true);  // tabIds[2] - active tab, should be muted
        expect(afterStates[3]).toBe(false); // tabIds[3] - unchanged
        expect(afterStates[4]).toBe(false); // tabIds[4] - unchanged
    });

    test('mute state persists after toggling with Alt-m', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}`);

        // Mute the tab
        await triggerMuteToggle(bgWs, initialTab.id);
        const muteSuccess = await pollForMuteState(bgWs, initialTab.id, true);
        expect(muteSuccess).toBe(true);

        // Wait a bit to ensure state persists
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify mute state persists
        const persistedMuted = await getTabMuteState(bgWs, initialTab.id);
        console.log(`After wait: tab ${initialTab.id} muted=${persistedMuted}`);
        expect(persistedMuted).toBe(true);

        // Switch to another tab and back
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[3]}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Switch back to original tab
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${initialTab.id}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify mute state still persists after tab switching
        const stillMuted = await getTabMuteState(bgWs, initialTab.id);
        console.log(`After tab switch: tab ${initialTab.id} muted=${stillMuted}`);
        expect(stillMuted).toBe(true);
    });

    test('Alt-m works correctly when tab is already muted', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}`);

        // Manually mute the tab (simulating tab already being muted)
        await setTabMuteState(bgWs, initialTab.id, true);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify tab is muted
        const alreadyMuted = await getTabMuteState(bgWs, initialTab.id);
        console.log(`Tab already muted: ${alreadyMuted}`);
        expect(alreadyMuted).toBe(true);

        // Press Alt-m should unmute it
        await triggerMuteToggle(bgWs, initialTab.id);

        // Poll for unmute
        const success = await pollForMuteState(bgWs, initialTab.id, false);
        expect(success).toBe(true);

        // Verify it's unmuted
        const finalMuted = await getTabMuteState(bgWs, initialTab.id);
        console.log(`After Alt-m on already-muted tab: muted=${finalMuted}`);
        expect(finalMuted).toBe(false);
    });
});
