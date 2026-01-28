/**
 * CDP Test: cmd_tab_previous
 *
 * Focused observability test for the tab previous command.
 * - Single command: cmd_tab_previous
 * - Single key: 'E'
 * - Single behavior: switch to previous tab (left)
 * - Focus: verify command execution and tab switching without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-previous.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-tab-previous.test.ts
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

describe('cmd_tab_previous', () => {
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

        // Create 5 tabs for testing (tab switching requires multiple tabs)
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

    test('pressing E switches to previous tab', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Press E to go to previous tab
        await sendKey(pageWs, 'E');

        // Wait for tab switch
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check new active tab
        const newTab = await getActiveTab(bgWs);
        console.log(`After E: index ${newTab.index}, id ${newTab.id}`);

        // Should have moved to a different tab
        expect(newTab.index).not.toBe(initialTab.index);
        expect(newTab.id).not.toBe(initialTab.id);
    });

    test('pressing E twice switches tabs twice', async () => {
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab index: ${initialTab.index}`);

        // Send first 'E' and wait for tab change
        await sendKey(pageWs, 'E');

        // Poll for tab change after first E
        let afterFirstE = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== initialTab.id) {
                afterFirstE = currentTab;
                break;
            }
        }

        expect(afterFirstE).not.toBeNull();
        console.log(`After first E: index ${afterFirstE.index} (moved from ${initialTab.index})`);

        // Reconnect to the newly active tab
        const newPageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        const newPageWs = await connectToCDP(newPageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Send second 'E' to the new active tab
        await sendKey(newPageWs, 'E');

        // Poll for tab change after second E
        let afterSecondE = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== afterFirstE.id) {
                afterSecondE = currentTab;
                break;
            }
        }

        expect(afterSecondE).not.toBeNull();
        console.log(`After second E: index ${afterSecondE.index} (moved from ${afterFirstE.index})`);

        // Cleanup new connection
        await closeCDP(newPageWs);

        // Verify we moved twice (each move changed tabs)
        expect(initialTab.id).not.toBe(afterFirstE.id);
        expect(afterFirstE.id).not.toBe(afterSecondE.id);
        // Note: afterSecondE might equal initialTab due to wraparound, that's OK
    });

    test('pressing 2E switches 2 tabs to the left', async () => {
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

        // Log initial tab index for debugging (note: may vary due to other browser tabs)
        console.log(`Initial tab index: ${initialTab.index}`);

        // The key assertion: 2E should move us exactly 2 tabs to the left
        // Calculate what the expected final tab should be (2 tabs left in our sequence)
        // tabIds is in creation order: [tab0, tab1, tab2(START), tab3, tab4]
        // 2E from tab2 should go to tab0
        const expectedFinalTabId = tabIds[0];
        const expectedDistance = 2;
        const expectedFinalIndex = initialTab.index - expectedDistance;

        console.log(`✓ Expected final tab: tabIds[0] (id=${expectedFinalTabId})`);
        console.log(`✓ Expected distance: ${expectedDistance} tabs to the left`);
        console.log(`✓ Expected final index: ${expectedFinalIndex} (current index ${initialTab.index} minus ${expectedDistance})`);
        console.log(`=== START TEST: will move from index ${initialTab.index} (tabIds[2]) exactly ${expectedDistance} tabs left ===\n`);

        // Send '2' followed by 'E' to create 2E command
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, 'E');

        // Poll for tab change after 2E
        let finalTab = null;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab && currentTab.id !== initialTab.id) {
                finalTab = currentTab;
                break;
            }
        }

        expect(finalTab).not.toBeNull();
        console.log(`\nAfter 2E: tab id ${finalTab.id} at index ${finalTab.index}`);

        // Verify we moved to the expected tab (tabIds[0])
        expect(finalTab.id).toBe(expectedFinalTabId);
        console.log(`✓ Assertion: moved to expectedTabId (tabIds[0])`);

        // Verify final tab index is correct
        expect(finalTab.index).toBe(expectedFinalIndex);
        console.log(`✓ Assertion: final tab index is ${expectedFinalIndex}`);

        // Calculate actual distance moved
        const actualDistance = initialTab.index - finalTab.index;
        console.log(`Actual distance moved: ${actualDistance} tabs to the left`);

        // Verify we moved exactly the expected distance
        expect(actualDistance).toBe(expectedDistance);
        console.log(`✓ Assertion: moved exactly ${expectedDistance} tabs to the left`);

        expect(finalTab.id).not.toBe(initialTab.id);
        console.log(`✓ Assertion: final tab is different from initial tab`);
    });
});
