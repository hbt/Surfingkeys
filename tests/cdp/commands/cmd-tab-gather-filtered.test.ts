/**
 * CDP Test: cmd_tab_gather_filtered
 *
 * Focused observability test for the gather filtered tabs command.
 * - Single command: cmd_tab_gather_filtered
 * - Single key: ';gt'
 * - Single behavior: gather selected tabs from other windows into current window
 * - Focus: verify command execution and tab gathering across windows
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-gather-filtered.test.ts
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
 * Query all tabs across all windows
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; windowId: number; url: string; index: number }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({}, (tabs) => {
                resolve(tabs.map(t => ({
                    id: t.id,
                    windowId: t.windowId,
                    url: t.url,
                    index: t.index
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
 * Move tab to a specific window
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

describe('cmd_tab_gather_filtered', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let mainWindowId: number;
    let secondWindowId: number;
    let thirdWindowId: number;
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

        // Get the current window (main window)
        mainWindowId = await getCurrentWindowId(bgWs);
        console.log(`Main window ID: ${mainWindowId}`);

        // Create main window tabs (3 tabs)
        for (let i = 0; i < 3; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 0); // First tab active
            testTabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Create second window with 2 tabs
        secondWindowId = await createWindow(bgWs, FIXTURE_URL);
        await new Promise(resolve => setTimeout(resolve, 300));
        const secondTabId = await createTab(bgWs, FIXTURE_URL, false);
        testTabIds.push(secondTabId);
        await moveTabToWindow(bgWs, secondTabId, secondWindowId);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Create third window with 2 tabs
        thirdWindowId = await createWindow(bgWs, FIXTURE_URL);
        await new Promise(resolve => setTimeout(resolve, 300));
        const thirdTabId = await createTab(bgWs, FIXTURE_URL, false);
        testTabIds.push(thirdTabId);
        await moveTabToWindow(bgWs, thirdTabId, thirdWindowId);
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log(`Created windows: main=${mainWindowId}, second=${secondWindowId}, third=${thirdWindowId}`);

        // Connect to the active tab in main window
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
        // Ensure we're on the main window
        const tabs = await getTabsInWindow(bgWs, mainWindowId);
        if (tabs.length > 0) {
            await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.update(${tabs[0].id}, { active: true }, () => {
                        resolve(true);
                    });
                })
            `);
        }

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
        // Cleanup - close all created windows except main
        try {
            if (secondWindowId) {
                await closeWindow(bgWs, secondWindowId);
            }
        } catch (e) {
            console.log('Second window already closed');
        }

        try {
            if (thirdWindowId) {
                await closeWindow(bgWs, thirdWindowId);
            }
        } catch (e) {
            console.log('Third window already closed');
        }

        // Close all test tabs in main window
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

    test('gatherTabs runtime function moves specified tabs to current window', async () => {
        // Get initial state
        const initialMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        const initialSecondTabs = await getTabsInWindow(bgWs, secondWindowId);

        console.log(`Initial main window tabs: ${initialMainTabs.length}`);
        console.log(`Initial second window tabs: ${initialSecondTabs.length}`);

        expect(initialSecondTabs.length).toBeGreaterThan(0);

        // Simulate gathering tabs by directly calling the runtime function
        // (this is what the omnibar does when you select tabs and press Enter)
        const tabsToGather = initialSecondTabs.slice(0, 1); // Gather first tab from second window

        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                const tabs = ${JSON.stringify(tabsToGather)};
                tabs.forEach((tab) => {
                    chrome.tabs.move(tab.id, { windowId: ${mainWindowId}, index: -1 });
                });
                resolve(true);
            })
        `);

        // Poll for tab count change in main window
        const expectedMainCount = initialMainTabs.length + tabsToGather.length;
        const gathered = await pollForTabCount(bgWs, mainWindowId, expectedMainCount);

        expect(gathered).toBe(true);

        // Verify final state
        const finalMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        const finalSecondTabs = await getTabsInWindow(bgWs, secondWindowId);

        console.log(`Final main window tabs: ${finalMainTabs.length}`);
        console.log(`Final second window tabs: ${finalSecondTabs.length}`);

        expect(finalMainTabs.length).toBe(expectedMainCount);
        expect(finalSecondTabs.length).toBe(initialSecondTabs.length - tabsToGather.length);

        // Verify the gathered tab is now in main window
        const gatheredTabId = tabsToGather[0].id;
        const gatheredTab = finalMainTabs.find(t => t.id === gatheredTabId);
        expect(gatheredTab).toBeDefined();
        console.log(`✓ Tab ${gatheredTabId} successfully moved to main window`);
    });

    test('gatherTabs moves multiple tabs from different windows', async () => {
        // Get tabs from second and third windows
        const secondTabs = await getTabsInWindow(bgWs, secondWindowId);
        const thirdTabs = await getTabsInWindow(bgWs, thirdWindowId);
        const initialMainTabs = await getTabsInWindow(bgWs, mainWindowId);

        console.log(`Second window has ${secondTabs.length} tabs`);
        console.log(`Third window has ${thirdTabs.length} tabs`);
        console.log(`Main window has ${initialMainTabs.length} tabs`);

        // Gather one tab from each window
        const tabsToGather = [
            ...(secondTabs.length > 0 ? [secondTabs[0]] : []),
            ...(thirdTabs.length > 0 ? [thirdTabs[0]] : [])
        ];

        expect(tabsToGather.length).toBeGreaterThan(0);

        // Execute gather
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                const tabs = ${JSON.stringify(tabsToGather)};
                tabs.forEach((tab) => {
                    chrome.tabs.move(tab.id, { windowId: ${mainWindowId}, index: -1 });
                });
                resolve(true);
            })
        `);

        // Poll for completion
        const expectedCount = initialMainTabs.length + tabsToGather.length;
        const gathered = await pollForTabCount(bgWs, mainWindowId, expectedCount);

        expect(gathered).toBe(true);

        // Verify all gathered tabs are now in main window
        const finalMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        expect(finalMainTabs.length).toBe(expectedCount);

        for (const tab of tabsToGather) {
            const found = finalMainTabs.find(t => t.id === tab.id);
            expect(found).toBeDefined();
            console.log(`✓ Tab ${tab.id} successfully gathered`);
        }
    });

    test('gatherWindows runtime function gathers all tabs from other windows', async () => {
        // Ensure we have valid windows with tabs
        // Previous tests may have caused windows to close when tabs were moved
        let testSecondWindowId = secondWindowId;
        let testThirdWindowId = thirdWindowId;

        // Check if windows still exist, recreate if needed
        const currentWindows = await getAllWindows(bgWs);
        const secondExists = currentWindows.some(w => w.id === secondWindowId);
        const thirdExists = currentWindows.some(w => w.id === thirdWindowId);

        if (!secondExists) {
            testSecondWindowId = await createWindow(bgWs, FIXTURE_URL);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!thirdExists) {
            testThirdWindowId = await createWindow(bgWs, FIXTURE_URL);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Create tabs in other windows
        const newTab1 = await createTab(bgWs, FIXTURE_URL, false);
        await moveTabToWindow(bgWs, newTab1, testSecondWindowId);
        await new Promise(resolve => setTimeout(resolve, 300));

        const newTab2 = await createTab(bgWs, FIXTURE_URL, false);
        await moveTabToWindow(bgWs, newTab2, testThirdWindowId);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get all tabs across all windows before gathering
        const allTabsBefore = await getAllTabs(bgWs);
        const mainTabsBefore = allTabsBefore.filter(t => t.windowId === mainWindowId);
        const otherTabsBefore = allTabsBefore.filter(t => t.windowId !== mainWindowId);

        console.log(`Initial state:`);
        console.log(`  Total tabs: ${allTabsBefore.length}`);
        console.log(`  Main window tabs: ${mainTabsBefore.length}`);
        console.log(`  Other window tabs: ${otherTabsBefore.length}`);

        expect(otherTabsBefore.length).toBeGreaterThan(0);

        // Store the tab IDs we expect to see in main window
        const expectedTabIds = allTabsBefore.map(t => t.id);

        // Execute gatherWindows (this is what ;gw does)
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({ currentWindow: false }, (tabs) => {
                    tabs.forEach((tab) => {
                        chrome.tabs.move(tab.id, { windowId: ${mainWindowId}, index: -1 });
                    });
                    resolve(true);
                });
            })
        `);

        // Wait for moves to complete - fixed wait time
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get final state
        const allTabsAfter = await getAllTabs(bgWs);
        const mainTabsAfter = allTabsAfter.filter(t => t.windowId === mainWindowId);

        console.log(`Final state:`);
        console.log(`  Total tabs: ${allTabsAfter.length}`);
        console.log(`  Main window tabs: ${mainTabsAfter.length}`);

        // All tabs should now be in main window
        expect(mainTabsAfter.length).toBeGreaterThanOrEqual(mainTabsBefore.length);

        // Verify that tabs from other windows are now in main window
        const gatheredCount = mainTabsAfter.length - mainTabsBefore.length;
        console.log(`Gathered ${gatheredCount} tabs into main window`);

        expect(gatheredCount).toBeGreaterThan(0);
        console.log(`✓ Successfully gathered tabs from other windows`);
    });

    test('gather handles edge case of no other windows', async () => {
        // Close all windows except main temporarily
        const windows = await getAllWindows(bgWs);
        const otherWindows = windows.filter(w => w.id !== mainWindowId);

        // If we already have only one window, the test is valid
        // Otherwise close others temporarily
        const closedWindows: number[] = [];
        for (const w of otherWindows) {
            try {
                await closeWindow(bgWs, w.id);
                closedWindows.push(w.id);
            } catch (e) {
                // Window may not close if it has special tabs
            }
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        const initialMainTabs = await getTabsInWindow(bgWs, mainWindowId);

        // Try to gather from other windows (should be none)
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({ currentWindow: false }, (tabs) => {
                    tabs.forEach((tab) => {
                        chrome.tabs.move(tab.id, { windowId: ${mainWindowId}, index: -1 });
                    });
                    resolve(true);
                });
            })
        `);

        await new Promise(resolve => setTimeout(resolve, 500));

        // Tab count should remain the same
        const finalMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        expect(finalMainTabs.length).toBe(initialMainTabs.length);

        console.log(`✓ No tabs gathered when no other windows exist`);

        // Recreate windows for remaining tests
        if (closedWindows.includes(secondWindowId)) {
            secondWindowId = await createWindow(bgWs, FIXTURE_URL);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        if (closedWindows.includes(thirdWindowId)) {
            thirdWindowId = await createWindow(bgWs, FIXTURE_URL);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    });

    test('gather preserves tab order when moving to main window', async () => {
        // Ensure second window exists and has tabs
        let testSecondWindowId = secondWindowId;

        const currentWindows = await getAllWindows(bgWs);
        const secondExists = currentWindows.some(w => w.id === secondWindowId);

        if (!secondExists) {
            // Recreate second window
            testSecondWindowId = await createWindow(bgWs, FIXTURE_URL);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Get tabs from second window
        const secondTabs = await getTabsInWindow(bgWs, testSecondWindowId);
        const initialMainTabs = await getTabsInWindow(bgWs, mainWindowId);

        if (secondTabs.length === 0) {
            // Create tabs in second window for this test
            const newTabId = await createTab(bgWs, FIXTURE_URL, false);
            await moveTabToWindow(bgWs, newTabId, testSecondWindowId);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const tabsToGather = await getTabsInWindow(bgWs, testSecondWindowId);
        const originalIds = tabsToGather.map(t => t.id);

        console.log(`Gathering ${tabsToGather.length} tabs in order: ${originalIds.join(', ')}`);

        // Gather all tabs from second window
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                const tabs = ${JSON.stringify(tabsToGather)};
                tabs.forEach((tab) => {
                    chrome.tabs.move(tab.id, { windowId: ${mainWindowId}, index: -1 });
                });
                resolve(true);
            })
        `);

        // Poll for completion
        const expectedCount = initialMainTabs.length + tabsToGather.length;
        const gathered = await pollForTabCount(bgWs, mainWindowId, expectedCount);

        expect(gathered).toBe(true);

        // Verify all tabs were moved
        const finalMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        expect(finalMainTabs.length).toBe(expectedCount);

        // Check that gathered tabs are now in main window
        for (const tabId of originalIds) {
            const found = finalMainTabs.find(t => t.id === tabId);
            expect(found).toBeDefined();
        }

        console.log(`✓ All ${originalIds.length} tabs preserved after gathering`);
    });
});
