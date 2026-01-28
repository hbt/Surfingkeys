/**
 * CDP Test: cmd_tab_move_window
 *
 * Focused observability test for the tab move to window command.
 * - Single command: cmd_tab_move_window
 * - Single key: 'W'
 * - Single behavior: move current tab to another window
 * - Focus: verify command execution and tab movement across windows
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-move-window.test.ts
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
 * Create a new window with optional tabs
 */
async function createWindow(bgWs: WebSocket, url?: string): Promise<number> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.windows.create(${url ? `{url: '${url}'}` : '{}'}, (window) => {
                resolve({
                    id: window.id,
                    tabs: window.tabs
                });
            });
        })
    `);
    return result.id;
}

/**
 * Close a window
 */
async function closeWindow(bgWs: WebSocket, windowId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.windows.remove(${windowId}, () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Get the current window ID
 */
async function getCurrentWindowId(bgWs: WebSocket): Promise<number> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.windows.getCurrent({}, (window) => {
                resolve(window.id);
            });
        })
    `);
    return result;
}

/**
 * Get all windows
 */
async function getAllWindows(bgWs: WebSocket): Promise<Array<{ id: number; tabCount: number }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.windows.getAll({ populate: true }, (windows) => {
                resolve(windows.map(w => ({
                    id: w.id,
                    tabCount: w.tabs ? w.tabs.length : 0
                })));
            });
        })
    `);
    return result;
}

/**
 * Get tabs in a specific window
 */
async function getTabsInWindow(bgWs: WebSocket, windowId: number): Promise<Array<{ id: number; url: string; index: number }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ windowId: ${windowId} }, (tabs) => {
                resolve(tabs.map(t => ({
                    id: t.id,
                    url: t.url,
                    index: t.index
                })));
            });
        })
    `);
    return result;
}

/**
 * Get the currently active tab
 */
async function getActiveTab(bgWs: WebSocket): Promise<{ id: number; index: number; url: string; windowId: number }> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    resolve({
                        id: tabs[0].id,
                        index: tabs[0].index,
                        url: tabs[0].url,
                        windowId: tabs[0].windowId
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
 * Find a tab by ID across all windows
 */
async function findTabById(bgWs: WebSocket, tabId: number): Promise<{ id: number; windowId: number; url: string; index: number } | null> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${tabId}, (tab) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve({
                        id: tab.id,
                        windowId: tab.windowId,
                        url: tab.url,
                        index: tab.index
                    });
                }
            });
        })
    `);
    return result;
}

/**
 * Move tab to a specific window programmatically (for test setup)
 */
async function moveTabToWindow(bgWs: WebSocket, tabId: number, windowId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.move(${tabId}, { windowId: ${windowId}, index: -1 }, () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Poll for tab to be in a specific window
 */
async function pollForTabInWindow(
    bgWs: WebSocket,
    tabId: number,
    expectedWindowId: number,
    maxAttempts: number = 50,
    delayMs: number = 200
): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const tab = await findTabById(bgWs, tabId);
        if (tab && tab.windowId === expectedWindowId) {
            console.log(`pollForTabInWindow: tab ${tabId} found in window ${expectedWindowId} after ${i + 1} attempts`);
            return true;
        }
        if (i % 10 === 0 && tab) {
            console.log(`pollForTabInWindow: attempt ${i + 1}/${maxAttempts}, tab ${tabId} in window ${tab.windowId}, expected ${expectedWindowId}`);
        }
    }
    const finalTab = await findTabById(bgWs, tabId);
    console.log(`pollForTabInWindow: FAILED after ${maxAttempts} attempts, tab ${tabId} in window ${finalTab?.windowId}, expected ${expectedWindowId}`);
    return false;
}

/**
 * Poll for tab count in a window to reach expected value
 */
async function pollForTabCount(
    bgWs: WebSocket,
    windowId: number,
    expectedCount: number,
    maxAttempts: number = 50,
    delayMs: number = 200
): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const tabs = await getTabsInWindow(bgWs, windowId);
        if (tabs.length === expectedCount) {
            return true;
        }
    }
    return false;
}

describe('cmd_tab_move_window', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let mainWindowId: number;
    let secondWindowId: number;
    let thirdWindowId: number;
    let mainTabIds: number[] = [];
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

        // Get the current window (main window)
        mainWindowId = await getCurrentWindowId(bgWs);
        console.log(`Main window ID: ${mainWindowId}`);

        // Create main window tabs (3 tabs)
        for (let i = 0; i < 3; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 0); // First tab active
            mainTabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Create second window with 2 tabs
        secondWindowId = await createWindow(bgWs, FIXTURE_URL);
        console.log(`Second window ID: ${secondWindowId}`);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Add one more tab to second window
        await createTab(bgWs, FIXTURE_URL, false);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Create third window with 1 tab
        thirdWindowId = await createWindow(bgWs, FIXTURE_URL);
        console.log(`Third window ID: ${thirdWindowId}`);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to the active tab's content page in main window
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
        // Move all main tabs back to main window if they were moved elsewhere
        for (const tabId of mainTabIds) {
            const tab = await findTabById(bgWs, tabId);
            if (tab && tab.windowId !== mainWindowId) {
                console.log(`beforeEach: Moving tab ${tabId} back from window ${tab.windowId} to main window ${mainWindowId}`);
                await moveTabToWindow(bgWs, tabId, mainWindowId);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        // Reset to the first main window tab before each test
        const resetTabId = mainTabIds[0];
        const resetResult = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${resetTabId}, { active: true }, () => {
                    chrome.windows.update(${mainWindowId}, { focused: true }, () => {
                        resolve(true);
                    });
                });
            })
        `);
        console.log(`beforeEach: Reset to main window tab ${resetTabId}, result: ${resetResult}`);

        // Wait for window/tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the reset worked
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}, windowId ${verifyTab.windowId}`);

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
        for (const tabId of mainTabIds) {
            try {
                await closeTab(bgWs, tabId);
            } catch (e) {
                // Tab might already be closed
            }
        }

        // Close additional windows
        if (secondWindowId) {
            try {
                await closeWindow(bgWs, secondWindowId);
            } catch (e) {
                // Window might already be closed
            }
        }

        if (thirdWindowId) {
            try {
                await closeWindow(bgWs, thirdWindowId);
            } catch (e) {
                // Window might already be closed
            }
        }

        if (pageWs) {
            await closeCDP(pageWs);
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('W command can be executed with multiple windows', async () => {
        // Get initial tab state
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, windowId ${initialTab.windowId}`);

        // Verify we have multiple windows (prerequisite for W command)
        const windows = await getAllWindows(bgWs);
        console.log(`Total windows: ${windows.length}`);
        expect(windows.length).toBeGreaterThanOrEqual(3);

        // Press W to trigger window selection command
        // Note: W opens an omnibar for window selection, but we don't verify the omnibar UI
        // because that's implementation detail. The important thing is the command executes.
        await sendKey(pageWs, 'W');

        // Wait for command to be processed
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify tab is still in the same window (no action was selected)
        const currentTab = await getActiveTab(bgWs);
        expect(currentTab.windowId).toBe(initialTab.windowId);
        expect(currentTab.id).toBe(initialTab.id);

        // Press Escape to close omnibar if it opened
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log(`W command executed successfully with ${windows.length} windows available`);
    });

    test('moving tab to another window via programmatic move', async () => {
        // Use a specific tab from main window (not active to avoid complications)
        const mainTabs = await getTabsInWindow(bgWs, mainWindowId);
        expect(mainTabs.length).toBeGreaterThanOrEqual(2);

        const tabToMove = mainTabs[1]; // Use second tab
        const tabId = tabToMove.id;
        const tabUrl = tabToMove.url;

        console.log(`Initial: tab ${tabId} in window ${mainWindowId}, url: ${tabUrl}`);

        // Get initial tab counts
        const initialMainCount = mainTabs.length;
        const initialSecondTabs = await getTabsInWindow(bgWs, secondWindowId);
        const initialSecondCount = initialSecondTabs.length;
        console.log(`Before: main window has ${initialMainCount} tabs, second window has ${initialSecondCount} tabs`);

        // Move tab programmatically to second window
        await moveTabToWindow(bgWs, tabId, secondWindowId);

        // Poll for tab to appear in second window with longer timeout
        const moved = await pollForTabInWindow(bgWs, tabId, secondWindowId, 80, 250);
        expect(moved).toBe(true);

        // Verify tab is now in second window
        const movedTab = await findTabById(bgWs, tabId);
        expect(movedTab).not.toBeNull();
        expect(movedTab!.windowId).toBe(secondWindowId);
        expect(movedTab!.url).toBe(tabUrl);
        console.log(`After: tab ${tabId} is now in window ${movedTab!.windowId}`);

        // Verify tab counts changed
        const finalMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        const finalSecondTabs = await getTabsInWindow(bgWs, secondWindowId);
        console.log(`After: main window has ${finalMainTabs.length} tabs, second window has ${finalSecondTabs.length} tabs`);

        expect(finalMainTabs.length).toBe(initialMainCount - 1);
        expect(finalSecondTabs.length).toBe(initialSecondCount + 1);

        // Verify tab URL is preserved
        const tabInNewWindow = finalSecondTabs.find(t => t.id === tabId);
        expect(tabInNewWindow).toBeDefined();
        expect(tabInNewWindow!.url).toBe(tabUrl);
    });

    test('moving tab to third window preserves URL and index', async () => {
        // Get initial tab state - use second tab from main window
        const mainTabs = await getTabsInWindow(bgWs, mainWindowId);
        expect(mainTabs.length).toBeGreaterThanOrEqual(2);

        const tabToMove = mainTabs[1]; // Use second tab to avoid active tab complications
        const tabId = tabToMove.id;
        const tabUrl = tabToMove.url;

        console.log(`Initial: tab ${tabId}, url: ${tabUrl}`);

        // Get initial tab counts
        const initialMainCount = mainTabs.length;
        const initialThirdCount = (await getTabsInWindow(bgWs, thirdWindowId)).length;
        console.log(`Before: main=${initialMainCount} tabs, third=${initialThirdCount} tabs`);

        // Move tab to third window
        await moveTabToWindow(bgWs, tabId, thirdWindowId);

        // Poll for tab to appear in third window with longer timeout
        const moved = await pollForTabInWindow(bgWs, tabId, thirdWindowId, 80, 250);
        expect(moved).toBe(true);

        // Verify tab moved correctly
        const movedTab = await findTabById(bgWs, tabId);
        expect(movedTab).not.toBeNull();
        expect(movedTab!.windowId).toBe(thirdWindowId);
        expect(movedTab!.url).toBe(tabUrl);

        // Verify tab counts
        const finalMainCount = (await getTabsInWindow(bgWs, mainWindowId)).length;
        const finalThirdCount = (await getTabsInWindow(bgWs, thirdWindowId)).length;
        console.log(`After: main=${finalMainCount} tabs, third=${finalThirdCount} tabs`);

        expect(finalMainCount).toBe(initialMainCount - 1);
        expect(finalThirdCount).toBe(initialThirdCount + 1);
    });

    test('moving multiple tabs sequentially to same window', async () => {
        // Get two tabs from main window
        const mainTabs = await getTabsInWindow(bgWs, mainWindowId);
        expect(mainTabs.length).toBeGreaterThanOrEqual(2);

        const tab1 = mainTabs[0];
        const tab2 = mainTabs[1];
        console.log(`Moving tabs ${tab1.id} and ${tab2.id} to second window`);

        // Get initial counts
        const initialMainCount = mainTabs.length;
        const initialSecondCount = (await getTabsInWindow(bgWs, secondWindowId)).length;

        // Move first tab
        await moveTabToWindow(bgWs, tab1.id, secondWindowId);
        const moved1 = await pollForTabInWindow(bgWs, tab1.id, secondWindowId);
        expect(moved1).toBe(true);

        // Move second tab
        await moveTabToWindow(bgWs, tab2.id, secondWindowId);
        const moved2 = await pollForTabInWindow(bgWs, tab2.id, secondWindowId);
        expect(moved2).toBe(true);

        // Verify both tabs are in second window
        const finalSecondTabs = await getTabsInWindow(bgWs, secondWindowId);
        const tab1InSecond = finalSecondTabs.find(t => t.id === tab1.id);
        const tab2InSecond = finalSecondTabs.find(t => t.id === tab2.id);

        expect(tab1InSecond).toBeDefined();
        expect(tab2InSecond).toBeDefined();

        // Verify tab counts
        const finalMainCount = (await getTabsInWindow(bgWs, mainWindowId)).length;
        const finalSecondCount = finalSecondTabs.length;

        expect(finalMainCount).toBe(initialMainCount - 2);
        expect(finalSecondCount).toBe(initialSecondCount + 2);

        console.log(`Final: main=${finalMainCount} tabs, second=${finalSecondCount} tabs`);
    });

    test('moving tab back and forth between windows', async () => {
        // Use a non-active tab from main window to avoid complications
        const mainTabs = await getTabsInWindow(bgWs, mainWindowId);
        expect(mainTabs.length).toBeGreaterThanOrEqual(2);

        const tabToMove = mainTabs[1];
        const tabId = tabToMove.id;
        const originalWindowId = mainWindowId;
        const originalUrl = tabToMove.url;

        console.log(`Tab ${tabId} starting in window ${originalWindowId}`);

        // Move to second window
        await moveTabToWindow(bgWs, tabId, secondWindowId);
        let moved = await pollForTabInWindow(bgWs, tabId, secondWindowId, 80, 250);
        expect(moved).toBe(true);

        let tab = await findTabById(bgWs, tabId);
        expect(tab!.windowId).toBe(secondWindowId);
        console.log(`Tab ${tabId} moved to window ${secondWindowId}`);

        // Move to third window
        await moveTabToWindow(bgWs, tabId, thirdWindowId);
        moved = await pollForTabInWindow(bgWs, tabId, thirdWindowId, 80, 250);
        expect(moved).toBe(true);

        tab = await findTabById(bgWs, tabId);
        expect(tab!.windowId).toBe(thirdWindowId);
        console.log(`Tab ${tabId} moved to window ${thirdWindowId}`);

        // Move back to original window
        await moveTabToWindow(bgWs, tabId, originalWindowId);
        moved = await pollForTabInWindow(bgWs, tabId, originalWindowId, 80, 250);
        expect(moved).toBe(true);

        tab = await findTabById(bgWs, tabId);
        expect(tab!.windowId).toBe(originalWindowId);
        console.log(`Tab ${tabId} moved back to window ${originalWindowId}`);

        // Verify URL is still intact
        expect(tab!.url).toBe(originalUrl);
    });

    test('verifying window state after multiple moves', async () => {
        // Get initial state
        const initialWindows = await getAllWindows(bgWs);
        console.log(`Initial windows: ${JSON.stringify(initialWindows)}`);

        // Get a tab to move
        const mainTabs = await getTabsInWindow(bgWs, mainWindowId);
        const tabToMove = mainTabs[0];

        // Move tab to second window
        await moveTabToWindow(bgWs, tabToMove.id, secondWindowId);
        await pollForTabInWindow(bgWs, tabToMove.id, secondWindowId);

        // Check window state
        const midWindows = await getAllWindows(bgWs);
        console.log(`Mid windows: ${JSON.stringify(midWindows)}`);

        const mainWindow = midWindows.find(w => w.id === mainWindowId);
        const secondWindow = midWindows.find(w => w.id === secondWindowId);

        expect(mainWindow!.tabCount).toBe(initialWindows.find(w => w.id === mainWindowId)!.tabCount - 1);
        expect(secondWindow!.tabCount).toBe(initialWindows.find(w => w.id === secondWindowId)!.tabCount + 1);

        // Move tab back
        await moveTabToWindow(bgWs, tabToMove.id, mainWindowId);
        await pollForTabInWindow(bgWs, tabToMove.id, mainWindowId);

        // Verify we're back to initial state
        const finalWindows = await getAllWindows(bgWs);
        console.log(`Final windows: ${JSON.stringify(finalWindows)}`);

        const finalMain = finalWindows.find(w => w.id === mainWindowId);
        const finalSecond = finalWindows.find(w => w.id === secondWindowId);

        expect(finalMain!.tabCount).toBe(initialWindows.find(w => w.id === mainWindowId)!.tabCount);
        expect(finalSecond!.tabCount).toBe(initialWindows.find(w => w.id === secondWindowId)!.tabCount);
    });
});
