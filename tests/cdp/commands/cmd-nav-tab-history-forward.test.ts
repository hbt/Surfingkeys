/**
 * CDP Test: cmd_nav_tab_history_forward
 *
 * Focused observability test for the tab history forward command.
 * - Single command: cmd_nav_tab_history_forward
 * - Single key: 'F'
 * - Single behavior: go forward one step in tab-specific history
 * - Focus: verify command execution and tab history navigation without timeouts
 *
 * Note: This tests TAB history (the history of which tabs were activated),
 * NOT browser history (which pages were visited within a tab).
 * See cmd_nav_history_forward for browser history navigation.
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-nav-tab-history-forward.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-nav-tab-history-forward.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-nav-tab-history-forward.test.ts
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
 * Activate a specific tab by ID
 */
async function activateTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.update(${tabId}, { active: true }, () => {
                resolve(true);
            });
        })
    `);
}

describe('cmd_nav_tab_history_forward', () => {
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

        // Create 5 tabs for testing tab history
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 4); // Make last tab active
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Connect to the active tab's content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Enable Runtime domain
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));

        // Wait for Surfingkeys to be ready
        await waitForSurfingkeysReady(pageWs);

        // Start coverage collection
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Build tab activation history by switching tabs
        // History will be: tab0 -> tab1 -> tab2 -> tab3 -> tab4 (current)
        console.log('\n=== Building tab activation history ===');

        // Activate tabs in sequence
        await activateTab(bgWs, tabIds[0]);
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`Activated tab 0 (id: ${tabIds[0]})`);

        await activateTab(bgWs, tabIds[1]);
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`Activated tab 1 (id: ${tabIds[1]})`);

        await activateTab(bgWs, tabIds[2]);
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`Activated tab 2 (id: ${tabIds[2]})`);

        await activateTab(bgWs, tabIds[3]);
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`Activated tab 3 (id: ${tabIds[3]})`);

        // Finally activate tab 4 (current tab)
        await activateTab(bgWs, tabIds[4]);
        await new Promise(resolve => setTimeout(resolve, 600));
        console.log(`Activated tab 4 (id: ${tabIds[4]})`);

        // Now go back twice to create a forward history
        // This puts us at tab2 with forward history: tab3, tab4
        const verifyBeforeBack = await getActiveTab(bgWs);
        console.log(`Before going back: active tab index ${verifyBeforeBack.index}, id ${verifyBeforeBack.id}`);

        // Reconnect to active tab before sending B commands
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // May already be closed
        }
        let pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);

        // Go back once (tab4 -> tab3)
        await sendKey(pageWs, 'B');
        await new Promise(resolve => setTimeout(resolve, 600));
        const afterFirstB = await getActiveTab(bgWs);
        console.log(`After first B: active tab index ${afterFirstB.index}, id ${afterFirstB.id}`);

        // Reconnect to new active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // May already be closed
        }
        pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);

        // Go back again (tab3 -> tab2)
        await sendKey(pageWs, 'B');
        await new Promise(resolve => setTimeout(resolve, 600));
        const afterSecondB = await getActiveTab(bgWs);
        console.log(`After second B: active tab index ${afterSecondB.index}, id ${afterSecondB.id}`);

        // Verify current tab
        const verifyTab = await getActiveTab(bgWs);
        console.log(`Setup complete: active tab index ${verifyTab.index}, id ${verifyTab.id}`);
        console.log(`Tab history: tab0 -> tab1 -> tab2 (current) [Forward: tab3, tab4]`);

        // Reconnect to active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // May already be closed
        }
        pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);

        // Capture test name and coverage
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        await captureAfterCoverage(pageWs, currentTestName, beforeCovData);
    });

    afterAll(async () => {
        // Cleanup tabs
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

    test('pressing F goes forward to next tab in history', async () => {
        // Setup: tab0 -> tab1 -> tab2 (current) [Forward: tab3, tab4]
        // Pressing F should go forward to tab3
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[2]);

        // Press F to go forward in tab history
        await sendKey(pageWs, 'F');

        // Poll for tab switch
        let afterF = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== initialTab.id) {
                afterF = currentTab;
                break;
            }
        }

        expect(afterF).not.toBeNull();
        console.log(`After F: index ${afterF.index}, id ${afterF.id}`);

        // Should have switched to tab3 (next in forward history)
        expect(afterF.id).toBe(tabIds[3]);
        console.log(`✓ Switched to tab3 (next in forward history) as expected`);
    });

    test('pressing F twice goes forward two steps in tab history', async () => {
        // Setup: tab0 -> tab1 -> tab2 (current) [Forward: tab3, tab4]
        // First F: tab2 -> tab3
        // Second F: tab3 -> tab4
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[2]);

        // First F
        await sendKey(pageWs, 'F');

        // Poll for first tab switch
        let afterFirstF = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== initialTab.id) {
                afterFirstF = currentTab;
                break;
            }
        }

        expect(afterFirstF).not.toBeNull();
        expect(afterFirstF.id).toBe(tabIds[3]);
        console.log(`After first F: index ${afterFirstF.index}, id ${afterFirstF.id} (tab3)`);

        // Reconnect to the newly active tab
        const newPageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        const newPageWs = await connectToCDP(newPageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Second F
        await sendKey(newPageWs, 'F');

        // Poll for second tab switch
        let afterSecondF = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== afterFirstF.id) {
                afterSecondF = currentTab;
                break;
            }
        }

        expect(afterSecondF).not.toBeNull();
        expect(afterSecondF.id).toBe(tabIds[4]);
        console.log(`After second F: index ${afterSecondF.index}, id ${afterSecondF.id} (tab4)`);

        // Cleanup new connection
        await closeCDP(newPageWs);

        // Verify we went forward two steps
        console.log(`✓ Successfully navigated forward two steps in tab history: tab2 -> tab3 -> tab4`);
    });

    test('2F goes forward two steps in tab history', async () => {
        // Note: repeatIgnore only affects saving to lastKeys (for '.' command)
        // It does NOT prevent numeric prefixes, so 2F will go forward twice
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[2]);

        // Send 2F (should go forward twice)
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, 'F');

        // Poll for tab switch
        let afterTwoF = null;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab && currentTab.id !== initialTab.id) {
                afterTwoF = currentTab;
                break;
            }
        }

        expect(afterTwoF).not.toBeNull();
        console.log(`After 2F: index ${afterTwoF.index}, id ${afterTwoF.id}`);

        // Should go forward two steps (to tab4), not one step
        expect(afterTwoF.id).toBe(tabIds[4]);
        console.log(`✓ 2F correctly went forward two steps (tab2 -> tab4)`);
    });

    test('F and B are inverses of each other', async () => {
        // Test that F undoes B (and vice versa)
        // Setup: tab0 -> tab1 -> tab2 (current) [Forward: tab3, tab4]
        const initialTab = await getActiveTab(bgWs);
        console.log(`Starting at tab2 (id: ${initialTab.id})`);
        expect(initialTab.id).toBe(tabIds[2]);

        // Press F to go forward to tab3
        await sendKey(pageWs, 'F');

        // Poll for tab switch to tab3
        let afterF = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== initialTab.id) {
                afterF = currentTab;
                break;
            }
        }

        expect(afterF).not.toBeNull();
        expect(afterF.id).toBe(tabIds[3]);
        console.log(`After F: at tab3 (id: ${afterF.id})`);

        // Reconnect to tab3
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        const newPageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Press B to go back to tab2
        await sendKey(newPageWs, 'B');

        // Poll for tab switch back to tab2
        let afterB = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== afterF.id) {
                afterB = currentTab;
                break;
            }
        }

        expect(afterB).not.toBeNull();
        expect(afterB.id).toBe(tabIds[2]);
        console.log(`After B: back at tab2 (id: ${afterB.id})`);

        // Cleanup new connection
        await closeCDP(newPageWs);

        // Verify F and B are inverses
        expect(afterB.id).toBe(initialTab.id);
        console.log(`✓ F and B are inverses: tab2 -> F -> tab3 -> B -> tab2`);
    });

    test('F command executes without throwing errors', async () => {
        // Basic smoke test: F should execute without errors
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Send F command
        await sendKey(pageWs, 'F');

        // Wait for command processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify browser is still in a valid state
        const afterF = await getActiveTab(bgWs);
        console.log(`After F: index ${afterF.index}, id ${afterF.id}`);

        expect(afterF).not.toBeNull();
        expect(afterF.id).toBeDefined();
        expect(tabIds).toContain(afterF.id);
        console.log(`✓ Browser in valid state after F command`);
    });
});
