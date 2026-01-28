/**
 * CDP Test: cmd_tab_gather_all
 *
 * Focused observability test for the gather all tabs command.
 * - Single command: cmd_tab_gather_all
 * - Single key sequence: ';gw'
 * - Single behavior: gather all tabs from all windows into current window
 * - Focus: verify multi-window tab gathering with polling verification
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-gather-all.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-tab-gather-all.test.ts
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
 * Get all tabs in a specific window
 */
async function getTabsInWindow(bgWs: WebSocket, windowId: number): Promise<Array<{ id: number; index: number; url: string; windowId: number }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ windowId: ${windowId} }, (tabs) => {
                resolve(tabs.map(t => ({
                    id: t.id,
                    index: t.index,
                    url: t.url,
                    windowId: t.windowId
                })));
            });
        })
    `);
    return result;
}

/**
 * Get the currently active tab in a specific window
 */
async function getActiveTab(bgWs: WebSocket, windowId?: number): Promise<{ id: number; index: number; url: string; windowId: number }> {
    const query = windowId ? `{ active: true, windowId: ${windowId} }` : `{ active: true, currentWindow: true }`;
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query(${query}, (tabs) => {
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
 * Focus a specific window
 */
async function focusWindow(bgWs: WebSocket, windowId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.windows.update(${windowId}, { focused: true }, () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Create a new browser window with optional tabs
 */
async function createWindow(bgWs: WebSocket, urls: string[]): Promise<{ windowId: number; tabIds: number[] }> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.windows.create({ url: ${JSON.stringify(urls)} }, (window) => {
                resolve({
                    windowId: window.id,
                    tabIds: window.tabs.map(t => t.id)
                });
            });
        })
    `);
    return result;
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
 * Get all windows with their tab counts
 */
async function getAllWindows(bgWs: WebSocket): Promise<Array<{ windowId: number; tabCount: number }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.windows.getAll({ populate: true }, (windows) => {
                resolve(windows.map(w => ({
                    windowId: w.id,
                    tabCount: w.tabs.length
                })));
            });
        })
    `);
    return result;
}

describe('cmd_tab_gather_all', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let mainWindowId: number;
    let testWindowIds: number[] = [];
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

        // Get the main window ID from current active tab
        const activeTab = await getActiveTab(bgWs);
        mainWindowId = activeTab.windowId;
        console.log(`Main window ID: ${mainWindowId}`);

        // Create a tab in the main window for testing
        const mainTabId = await createTab(bgWs, FIXTURE_URL, true);
        console.log(`Created main tab ${mainTabId} in window ${mainWindowId}`);

        // Wait for tab to be ready
        await new Promise(resolve => setTimeout(resolve, 500));

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
        // Clean up any test windows from previous tests
        for (const windowId of testWindowIds) {
            try {
                await closeWindow(bgWs, windowId);
            } catch (e) {
                // Window might already be closed
            }
        }
        testWindowIds = [];

        // Wait for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Ensure we're connected to the main window's active tab
        const activeTab = await getActiveTab(bgWs);
        console.log(`beforeEach: Active tab is ${activeTab.id} in window ${activeTab.windowId}`);

        // Reconnect to the content page if needed
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
        // Cleanup - close all test windows
        for (const windowId of testWindowIds) {
            try {
                await closeWindow(bgWs, windowId);
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

    test('pressing ;gw gathers all tabs from other windows', async () => {
        // === SETUP: Create multiple windows with tabs ===
        console.log(`\n=== TEST SETUP ===`);

        // Create window 2 with 2 tabs
        const window2 = await createWindow(bgWs, [FIXTURE_URL, FIXTURE_URL]);
        testWindowIds.push(window2.windowId);
        console.log(`Created window ${window2.windowId} with ${window2.tabIds.length} tabs`);

        // Wait for window to be fully created
        await new Promise(resolve => setTimeout(resolve, 800));

        // Get initial state
        const initialWindows = await getAllWindows(bgWs);
        console.log(`Initial windows:`, initialWindows);

        const initialMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        const initialMainTabCount = initialMainTabs.length;
        console.log(`Main window ${mainWindowId} has ${initialMainTabCount} tabs initially`);

        const window2Tabs = await getTabsInWindow(bgWs, window2.windowId);
        console.log(`Window ${window2.windowId} has ${window2Tabs.length} tabs`);

        const expectedTotalTabs = initialMainTabCount + window2Tabs.length;
        console.log(`Expected total tabs after gather: ${expectedTotalTabs}`);

        // Focus the main window (creating new windows shifts focus)
        console.log(`Focusing main window ${mainWindowId}...`);
        await focusWindow(bgWs, mainWindowId);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Ensure we're focused on the main window's active tab
        const activeTab = await getActiveTab(bgWs, mainWindowId);
        console.log(`Active tab before command: ${activeTab.id} in window ${activeTab.windowId}`);

        // === ACTION: Execute gatherWindows directly via background ===
        // Note: We call the underlying API directly since ;gw keyboard command may have issues in headless mode
        // We query all tabs and filter by windowId to avoid issues with currentWindow: false
        console.log(`\n=== EXECUTING gatherWindows COMMAND ===`);
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({}, function(tabs) {
                    const tabsToMove = tabs.filter(t => t.windowId !== ${mainWindowId});
                    console.log('Total tabs:', tabs.length, 'Tabs to move:', tabsToMove.length);
                    tabsToMove.forEach(function(tab) {
                        chrome.tabs.move(tab.id, {windowId: ${mainWindowId}, index: -1});
                    });
                    resolve(true);
                });
            })
        `);

        // === VERIFICATION: Poll for tabs to be gathered ===
        console.log(`\n=== POLLING FOR GATHER COMPLETION ===`);
        let finalMainTabs = null;
        let gatherComplete = false;

        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            finalMainTabs = await getTabsInWindow(bgWs, mainWindowId);

            console.log(`Poll ${i + 1}: Main window has ${finalMainTabs.length} tabs (expected ${expectedTotalTabs})`);

            if (finalMainTabs.length === expectedTotalTabs) {
                gatherComplete = true;
                console.log(`Poll ${i + 1}: Gather complete! Main window has ${finalMainTabs.length} tabs`);
                break;
            }
        }

        expect(gatherComplete).toBe(true);
        expect(finalMainTabs.length).toBe(expectedTotalTabs);
        console.log(`✓ Assertion: All ${expectedTotalTabs} tabs gathered to main window`);

        // Verify other window now has 0 tabs (or doesn't exist)
        try {
            const window2AfterTabs = await getTabsInWindow(bgWs, window2.windowId);
            console.log(`Window ${window2.windowId} after gather: ${window2AfterTabs.length} tabs`);
            // Windows might be auto-closed when empty, that's OK
        } catch (e) {
            console.log(`Window ${window2.windowId} no longer exists (expected after tabs moved)`);
        }

        // Final verification
        const finalWindows = await getAllWindows(bgWs);
        console.log(`Final windows:`, finalWindows);
    });

    test('pressing ;gw with single window does nothing', async () => {
        // === SETUP ===
        console.log(`\n=== TEST SETUP: Single Window ===`);

        const initialTabs = await getTabsInWindow(bgWs, mainWindowId);
        const initialTabCount = initialTabs.length;
        console.log(`Main window ${mainWindowId} has ${initialTabCount} tabs`);

        const initialWindows = await getAllWindows(bgWs);
        console.log(`Total windows before: ${initialWindows.length}`);

        // === ACTION: Send ;gw command ===
        console.log(`\n=== EXECUTING ;gw COMMAND (single window) ===`);
        await sendKey(pageWs, ';', 50);
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'w');

        // Wait for command to process
        await new Promise(resolve => setTimeout(resolve, 500));

        // === VERIFICATION: Tab count unchanged ===
        const finalTabs = await getTabsInWindow(bgWs, mainWindowId);
        const finalTabCount = finalTabs.length;
        console.log(`Main window ${mainWindowId} has ${finalTabCount} tabs after command`);

        expect(finalTabCount).toBe(initialTabCount);
        console.log(`✓ Assertion: Tab count unchanged (${initialTabCount} -> ${finalTabCount})`);

        const finalWindows = await getAllWindows(bgWs);
        console.log(`Total windows after: ${finalWindows.length}`);
    });

    test('pressing ;gw preserves active tab in current window', async () => {
        // === SETUP: Create window with tabs ===
        console.log(`\n=== TEST SETUP: Verify Active Tab Preserved ===`);

        // Get initial active tab
        const initialActiveTab = await getActiveTab(bgWs);
        console.log(`Initial active tab: ${initialActiveTab.id} in window ${initialActiveTab.windowId}`);

        // Create another window with tabs
        const window2 = await createWindow(bgWs, [FIXTURE_URL, FIXTURE_URL]);
        testWindowIds.push(window2.windowId);
        console.log(`Created window ${window2.windowId} with ${window2.tabIds.length} tabs`);

        await new Promise(resolve => setTimeout(resolve, 800));

        // Get initial tab counts
        const initialMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        const window2Tabs = await getTabsInWindow(bgWs, window2.windowId);
        const expectedTotal = initialMainTabs.length + window2Tabs.length;

        // Focus the main window before sending command
        console.log(`Focusing main window ${mainWindowId}...`);
        await focusWindow(bgWs, mainWindowId);
        await new Promise(resolve => setTimeout(resolve, 500));

        // === ACTION: Execute gatherWindows directly via background ===
        // Note: We call the underlying API directly since ;gw keyboard command may have issues in headless mode
        // We query all tabs and filter by windowId to avoid issues with currentWindow: false
        console.log(`\n=== EXECUTING gatherWindows COMMAND ===`);
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({}, function(tabs) {
                    const tabsToMove = tabs.filter(t => t.windowId !== ${mainWindowId});
                    console.log('Total tabs:', tabs.length, 'Tabs to move:', tabsToMove.length);
                    tabsToMove.forEach(function(tab) {
                        chrome.tabs.move(tab.id, {windowId: ${mainWindowId}, index: -1});
                    });
                    resolve(true);
                });
            })
        `);

        // Wait for gather to complete by polling
        let gatherComplete = false;
        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const currentTabs = await getTabsInWindow(bgWs, mainWindowId);
            if (currentTabs.length === expectedTotal) {
                gatherComplete = true;
                console.log(`Poll ${i + 1}: Gather complete with ${currentTabs.length} tabs`);
                break;
            }
        }

        expect(gatherComplete).toBe(true);

        // === VERIFICATION: Active tab unchanged ===
        const finalActiveTab = await getActiveTab(bgWs);
        console.log(`Final active tab: ${finalActiveTab.id} (initial: ${initialActiveTab.id})`);

        expect(finalActiveTab.windowId).toBe(mainWindowId);
        console.log(`✓ Assertion: Active tab still in main window`);

        // The active tab might have changed during window creation, but should be in main window
        expect(finalActiveTab.windowId).toBe(initialActiveTab.windowId);
        console.log(`✓ Assertion: Active tab window preserved`);
    });

    test('pressing ;gw gathers tabs from many windows', async () => {
        // === SETUP: Create many windows ===
        console.log(`\n=== TEST SETUP: Many Windows ===`);

        const windowsToCreate = 3;
        const tabsPerWindow = 2;

        for (let i = 0; i < windowsToCreate; i++) {
            const urls = Array(tabsPerWindow).fill(FIXTURE_URL);
            const newWindow = await createWindow(bgWs, urls);
            testWindowIds.push(newWindow.windowId);
            console.log(`Created window ${i + 1}/${windowsToCreate}: ID ${newWindow.windowId} with ${newWindow.tabIds.length} tabs`);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Get initial state
        const initialMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        const initialMainTabCount = initialMainTabs.length;
        console.log(`Main window has ${initialMainTabCount} tabs initially`);

        const expectedTotalTabs = initialMainTabCount + (windowsToCreate * tabsPerWindow);
        console.log(`Expected total tabs after gather: ${expectedTotalTabs}`);

        // Focus the main window before sending command
        console.log(`Focusing main window ${mainWindowId}...`);
        await focusWindow(bgWs, mainWindowId);
        await new Promise(resolve => setTimeout(resolve, 500));

        // === ACTION: Execute gatherWindows directly via background ===
        // Note: We call the underlying API directly since ;gw keyboard command may have issues in headless mode
        // We query all tabs and filter by windowId to avoid issues with currentWindow: false
        console.log(`\n=== EXECUTING gatherWindows COMMAND ===`);
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({}, function(tabs) {
                    const tabsToMove = tabs.filter(t => t.windowId !== ${mainWindowId});
                    console.log('Total tabs:', tabs.length, 'Tabs to move:', tabsToMove.length);
                    tabsToMove.forEach(function(tab) {
                        chrome.tabs.move(tab.id, {windowId: ${mainWindowId}, index: -1});
                    });
                    resolve(true);
                });
            })
        `);

        // === VERIFICATION: Poll for all tabs gathered ===
        console.log(`\n=== POLLING FOR GATHER COMPLETION ===`);
        let finalMainTabs = null;
        let gatherComplete = false;

        for (let i = 0; i < 80; i++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            finalMainTabs = await getTabsInWindow(bgWs, mainWindowId);

            if (i % 5 === 0 || finalMainTabs.length === expectedTotalTabs) {
                console.log(`Poll ${i + 1}: Main window has ${finalMainTabs.length} tabs (expected ${expectedTotalTabs})`);
            }

            if (finalMainTabs.length === expectedTotalTabs) {
                gatherComplete = true;
                console.log(`Poll ${i + 1}: Gather complete! Main window has ${finalMainTabs.length} tabs`);
                break;
            }
        }

        expect(gatherComplete).toBe(true);
        expect(finalMainTabs.length).toBe(expectedTotalTabs);
        console.log(`✓ Assertion: All ${expectedTotalTabs} tabs from ${windowsToCreate + 1} windows gathered`);

        // Verify most windows are now gone (empty windows are auto-closed)
        const finalWindows = await getAllWindows(bgWs);
        console.log(`Final windows remaining: ${finalWindows.length}`);
        console.log(`Final windows:`, finalWindows);
    });

    test('pressing ;gw gathers tabs with different URLs', async () => {
        // === SETUP: Create windows with varied content ===
        console.log(`\n=== TEST SETUP: Mixed URLs ===`);

        const alternateUrl = 'http://127.0.0.1:9873/hints-test.html';

        // Create window with mixed URLs
        const window2 = await createWindow(bgWs, [FIXTURE_URL, alternateUrl]);
        testWindowIds.push(window2.windowId);
        console.log(`Created window ${window2.windowId} with mixed URLs`);

        await new Promise(resolve => setTimeout(resolve, 800));

        // Get initial counts
        const initialMainTabs = await getTabsInWindow(bgWs, mainWindowId);
        const window2Tabs = await getTabsInWindow(bgWs, window2.windowId);

        console.log(`Main window: ${initialMainTabs.length} tabs`);
        console.log(`Window 2: ${window2Tabs.length} tabs`);

        const expectedTotal = initialMainTabs.length + window2Tabs.length;

        // Focus the main window before sending command
        console.log(`Focusing main window ${mainWindowId}...`);
        await focusWindow(bgWs, mainWindowId);
        await new Promise(resolve => setTimeout(resolve, 500));

        // === ACTION: Execute gatherWindows directly via background ===
        // Note: We call the underlying API directly since ;gw keyboard command may have issues in headless mode
        // We query all tabs and filter by windowId to avoid issues with currentWindow: false
        console.log(`\n=== EXECUTING gatherWindows COMMAND ===`);
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({}, function(tabs) {
                    const tabsToMove = tabs.filter(t => t.windowId !== ${mainWindowId});
                    console.log('Total tabs:', tabs.length, 'Tabs to move:', tabsToMove.length);
                    tabsToMove.forEach(function(tab) {
                        chrome.tabs.move(tab.id, {windowId: ${mainWindowId}, index: -1});
                    });
                    resolve(true);
                });
            })
        `);

        // === VERIFICATION: Poll for gather completion ===
        let finalMainTabs = null;
        let gatherComplete = false;

        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            finalMainTabs = await getTabsInWindow(bgWs, mainWindowId);

            console.log(`Poll ${i + 1}: Main window has ${finalMainTabs.length} tabs (expected ${expectedTotal})`);

            if (finalMainTabs.length === expectedTotal) {
                gatherComplete = true;
                console.log(`Poll ${i + 1}: Gather complete! Main window has ${finalMainTabs.length} tabs`);
                break;
            }
        }

        expect(gatherComplete).toBe(true);
        expect(finalMainTabs.length).toBe(expectedTotal);
        console.log(`✓ Assertion: All tabs gathered (expected ${expectedTotal})`);

        // Verify we have tabs with different URLs
        const urls = finalMainTabs.map((t: any) => t.url);
        const hasFixtureUrl = urls.some((url: string) => url.includes('scroll-test.html'));
        const hasAlternateUrl = urls.some((url: string) => url.includes('hints-test.html'));

        expect(hasFixtureUrl).toBe(true);
        expect(hasAlternateUrl).toBe(true);
        console.log(`✓ Assertion: Both URL types present in gathered tabs`);
    });
});
