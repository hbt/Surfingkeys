/**
 * CDP Test: cmd_marks_jump_new_tab
 *
 * Focused observability test for the marks jump in new tab command.
 * - Single command: cmd_marks_jump_new_tab
 * - Single key: "<Ctrl-'>"
 * - Single behavior: jump to vim mark in new tab
 * - Focus: verify command execution and new tab creation without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-marks-jump-new-tab.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-marks-jump-new-tab.test.ts
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
 * Get all tabs in current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<{ id: number; index: number; url: string; active: boolean }[]> {
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
 * Add a vim mark pointing to a specific URL using CDP message bridge
 */
async function addVIMark(bgWs: WebSocket, mark: string, url: string): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            const markData = {
                "${mark}": {
                    url: "${url}",
                    scrollLeft: 0,
                    scrollTop: 0
                }
            };
            if (globalThis.__CDP_MESSAGE_BRIDGE__) {
                globalThis.__CDP_MESSAGE_BRIDGE__.dispatch('addVIMark', { mark: markData }, false);
                resolve(true);
            } else {
                console.error('CDP_MESSAGE_BRIDGE not available');
                resolve(false);
            }
        })
    `);
}

/**
 * Poll for new tab creation with specific URL
 */
async function pollForNewTab(
    bgWs: WebSocket,
    initialTabIds: number[],
    expectedUrl: string,
    maxAttempts: number = 30,
    delayMs: number = 200
): Promise<{ id: number; index: number; url: string } | null> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const currentTabs = await getAllTabs(bgWs);

        // Find any new tabs not in the initial list
        const newTabs = currentTabs.filter(t => !initialTabIds.includes(t.id));

        // Find the new tab with matching URL
        const matchingTab = newTabs.find(t => t.url === expectedUrl);
        if (matchingTab) {
            return matchingTab;
        }
    }
    return null;
}

describe('cmd_marks_jump_new_tab', () => {
    const FIXTURE_BASE_URL = 'http://127.0.0.1:9873';
    const FIXTURE_URL_1 = `${FIXTURE_BASE_URL}/scroll-test.html`;
    const FIXTURE_URL_2 = `${FIXTURE_BASE_URL}/input-test.html`;
    const FIXTURE_URL_3 = `${FIXTURE_BASE_URL}/visual-test.html`;

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
            const tabId = await createTab(bgWs, FIXTURE_URL_1, i === 2); // Make tab 2 active (middle tab)
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

        // Wait for tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the reset worked
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}`);

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

    test('pressing <Ctrl-\'>a opens mark "a" in new tab', async () => {
        // Add a vim mark "a" pointing to input-test.html
        await addVIMark(bgWs, 'a', FIXTURE_URL_2);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get initial tab state
        const initialTabs = await getAllTabs(bgWs);
        const initialTabIds = initialTabs.map(t => t.id);
        const initialTabCount = initialTabs.length;
        console.log(`Initial tab count: ${initialTabCount}`);
        console.log(`Initial tab IDs: ${initialTabIds.join(', ')}`);

        // Send Ctrl+' followed by 'a' to jump to mark "a" in new tab
        await sendKey(pageWs, 'Ctrl+\'', 50);
        await sendKey(pageWs, 'a');

        // Poll for new tab creation with marked URL
        const newTab = await pollForNewTab(bgWs, initialTabIds, FIXTURE_URL_2);

        // Verify new tab was created
        expect(newTab).not.toBeNull();
        console.log(`New tab created: id ${newTab.id}, url: ${newTab.url}`);

        // Verify the new tab has the correct URL
        expect(newTab.url).toBe(FIXTURE_URL_2);
        console.log(`✓ Assertion: new tab URL matches marked URL`);

        // Verify tab count increased by 1
        const finalTabs = await getAllTabs(bgWs);
        expect(finalTabs.length).toBe(initialTabCount + 1);
        console.log(`✓ Assertion: tab count increased from ${initialTabCount} to ${finalTabs.length}`);

        // Cleanup: close the new tab
        await closeTab(bgWs, newTab.id);
    });

    test('pressing <Ctrl-\'>b opens mark "b" in new tab', async () => {
        // Add a vim mark "b" pointing to visual-test.html
        await addVIMark(bgWs, 'b', FIXTURE_URL_3);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get initial tab state
        const initialTabs = await getAllTabs(bgWs);
        const initialTabIds = initialTabs.map(t => t.id);
        const initialTabCount = initialTabs.length;
        console.log(`Initial tab count: ${initialTabCount}`);

        // Send Ctrl+' followed by 'b'
        await sendKey(pageWs, 'Ctrl+\'', 50);
        await sendKey(pageWs, 'b');

        // Poll for new tab creation
        const newTab = await pollForNewTab(bgWs, initialTabIds, FIXTURE_URL_3);

        // Verify new tab was created
        expect(newTab).not.toBeNull();
        console.log(`New tab created: id ${newTab.id}, url: ${newTab.url}`);

        // Verify the new tab has the correct URL
        expect(newTab.url).toBe(FIXTURE_URL_3);
        console.log(`✓ Assertion: new tab URL matches marked URL (visual-test.html)`);

        // Cleanup: close the new tab
        await closeTab(bgWs, newTab.id);
    });

    test('multiple marks can be set and jumped to', async () => {
        // Add multiple marks
        await addVIMark(bgWs, 'x', FIXTURE_URL_2);
        await addVIMark(bgWs, 'y', FIXTURE_URL_3);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get initial tab state
        const initialTabs = await getAllTabs(bgWs);
        const initialTabIds = initialTabs.map(t => t.id);

        // Jump to mark 'x'
        await sendKey(pageWs, 'Ctrl+\'', 50);
        await sendKey(pageWs, 'x');

        const newTab1 = await pollForNewTab(bgWs, initialTabIds, FIXTURE_URL_2);
        expect(newTab1).not.toBeNull();
        expect(newTab1.url).toBe(FIXTURE_URL_2);
        console.log(`✓ First mark 'x' opened: ${newTab1.url}`);

        // Update tab list after first jump
        const tabsAfterFirst = await getAllTabs(bgWs);
        const tabIdsAfterFirst = tabsAfterFirst.map(t => t.id);

        // Reconnect to current active page before sending next command
        try {
            await closeCDP(pageWs);
        } catch (e) {}
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        await waitForSurfingkeysReady(pageWs);

        // Jump to mark 'y'
        await sendKey(pageWs, 'Ctrl+\'', 50);
        await sendKey(pageWs, 'y');

        const newTab2 = await pollForNewTab(bgWs, tabIdsAfterFirst, FIXTURE_URL_3);
        expect(newTab2).not.toBeNull();
        expect(newTab2.url).toBe(FIXTURE_URL_3);
        console.log(`✓ Second mark 'y' opened: ${newTab2.url}`);

        // Verify both tabs are different
        expect(newTab1.id).not.toBe(newTab2.id);
        console.log(`✓ Assertion: two different tabs created`);

        // Cleanup: close new tabs
        await closeTab(bgWs, newTab1.id);
        await closeTab(bgWs, newTab2.id);
    });

    test('jumping to non-existent mark does not create new tab', async () => {
        // Get initial tab state
        const initialTabs = await getAllTabs(bgWs);
        const initialTabIds = initialTabs.map(t => t.id);
        const initialTabCount = initialTabs.length;
        console.log(`Initial tab count: ${initialTabCount}`);

        // Try to jump to non-existent mark 'z'
        await sendKey(pageWs, 'Ctrl+\'', 50);
        await sendKey(pageWs, 'z');

        // Wait a bit to ensure no tab creation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check tab count
        const finalTabs = await getAllTabs(bgWs);
        expect(finalTabs.length).toBe(initialTabCount);
        console.log(`✓ Assertion: tab count unchanged (${finalTabs.length})`);

        // Verify no new tabs were created
        const finalTabIds = finalTabs.map(t => t.id);
        const newTabs = finalTabIds.filter(id => !initialTabIds.includes(id));
        expect(newTabs.length).toBe(0);
        console.log(`✓ Assertion: no new tabs created for non-existent mark`);
    });

    test('mark persists after being jumped to', async () => {
        // Add a mark
        await addVIMark(bgWs, 'p', FIXTURE_URL_2);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get initial tab state
        const initialTabs = await getAllTabs(bgWs);
        const initialTabIds = initialTabs.map(t => t.id);

        // Jump to mark 'p' first time
        await sendKey(pageWs, 'Ctrl+\'', 50);
        await sendKey(pageWs, 'p');

        const newTab1 = await pollForNewTab(bgWs, initialTabIds, FIXTURE_URL_2);
        expect(newTab1).not.toBeNull();
        console.log(`✓ First jump to mark 'p' successful`);

        // Close the new tab
        await closeTab(bgWs, newTab1.id);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get updated tab state
        const tabsAfterClose = await getAllTabs(bgWs);
        const tabIdsAfterClose = tabsAfterClose.map(t => t.id);

        // Reconnect to active page
        try {
            await closeCDP(pageWs);
        } catch (e) {}
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        await waitForSurfingkeysReady(pageWs);

        // Jump to mark 'p' second time (mark should still exist)
        await sendKey(pageWs, 'Ctrl+\'', 50);
        await sendKey(pageWs, 'p');

        const newTab2 = await pollForNewTab(bgWs, tabIdsAfterClose, FIXTURE_URL_2);
        expect(newTab2).not.toBeNull();
        expect(newTab2.url).toBe(FIXTURE_URL_2);
        console.log(`✓ Second jump to mark 'p' successful - mark persisted`);

        // Cleanup
        await closeTab(bgWs, newTab2.id);
    });
});
