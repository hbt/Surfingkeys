/**
 * CDP Test: cmd_nav_tab_history_back
 *
 * Focused observability test for the tab history back command.
 * - Single command: cmd_nav_tab_history_back
 * - Single key: 'B'
 * - Single behavior: go back one step in tab-specific history
 * - Focus: verify command execution and tab history navigation without timeouts
 *
 * Note: This tests TAB history (the history of which tabs were activated),
 * NOT browser history (which pages were visited within a tab).
 * See cmd_nav_history_back for browser history navigation.
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-nav-tab-history-back.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-nav-tab-history-back.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-nav-tab-history-back.test.ts
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

describe('cmd_nav_tab_history_back', () => {
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

        // Verify current tab
        const verifyTab = await getActiveTab(bgWs);
        console.log(`Setup complete: active tab index ${verifyTab.index}, id ${verifyTab.id}`);
        console.log(`Tab history: tab0 -> tab1 -> tab2 -> tab3 -> tab4 (current)`);

        // Reconnect to active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // May already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
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

    test('pressing B goes back to previously active tab', async () => {
        // History: tab0 -> tab1 -> tab2 -> tab3 -> tab4 (current)
        // Pressing B should go back to tab3 (previous in history)
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[4]);

        // Press B to go back in tab history
        await sendKey(pageWs, 'B');

        // Poll for tab switch
        let afterB = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== initialTab.id) {
                afterB = currentTab;
                break;
            }
        }

        expect(afterB).not.toBeNull();
        console.log(`After B: index ${afterB.index}, id ${afterB.id}`);

        // Should have switched to tab3 (previous in history)
        expect(afterB.id).toBe(tabIds[3]);
        console.log(`✓ Switched to tab3 (previous in history) as expected`);
    });

    test('pressing B twice goes back two steps in tab history', async () => {
        // History: tab0 -> tab1 -> tab2 -> tab3 -> tab4 (current)
        // First B: tab4 -> tab3
        // Second B: tab3 -> tab2
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[4]);

        // First B
        await sendKey(pageWs, 'B');

        // Poll for first tab switch
        let afterFirstB = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== initialTab.id) {
                afterFirstB = currentTab;
                break;
            }
        }

        expect(afterFirstB).not.toBeNull();
        expect(afterFirstB.id).toBe(tabIds[3]);
        console.log(`After first B: index ${afterFirstB.index}, id ${afterFirstB.id} (tab3)`);

        // Reconnect to the newly active tab
        const newPageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        const newPageWs = await connectToCDP(newPageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Second B
        await sendKey(newPageWs, 'B');

        // Poll for second tab switch
        let afterSecondB = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== afterFirstB.id) {
                afterSecondB = currentTab;
                break;
            }
        }

        expect(afterSecondB).not.toBeNull();
        expect(afterSecondB.id).toBe(tabIds[2]);
        console.log(`After second B: index ${afterSecondB.index}, id ${afterSecondB.id} (tab2)`);

        // Cleanup new connection
        await closeCDP(newPageWs);

        // Verify we went back two steps
        console.log(`✓ Successfully navigated back two steps in tab history: tab4 -> tab3 -> tab2`);
    });

    test('2B goes back two steps in tab history', async () => {
        // Note: repeatIgnore only affects saving to lastKeys (for '.' command)
        // It does NOT prevent numeric prefixes, so 2B will go back twice
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[4]);

        // Send 2B (should go back twice)
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, 'B');

        // Poll for tab switch
        let afterTwoB = null;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab && currentTab.id !== initialTab.id) {
                afterTwoB = currentTab;
                break;
            }
        }

        expect(afterTwoB).not.toBeNull();
        console.log(`After 2B: index ${afterTwoB.index}, id ${afterTwoB.id}`);

        // Should go back two steps (to tab2), not one step
        expect(afterTwoB.id).toBe(tabIds[2]);
        console.log(`✓ 2B correctly went back two steps (tab4 -> tab2)`);
    });

    test('3B goes back three steps in tab history', async () => {
        // History: tab0 -> tab1 -> tab2 -> tab3 -> tab4 (current)
        // Pressing 3B should go back 3 steps: tab4 -> tab1
        const initialTab = await getActiveTab(bgWs);
        expect(initialTab.id).toBe(tabIds[4]);
        console.log(`Starting at tab4 (id: ${initialTab.id})`);

        // Send 3B to go back 3 steps
        await sendKey(pageWs, '3', 50);
        await sendKey(pageWs, 'B');

        // Poll for tab switch
        let finalTab = null;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const currentTab = await getActiveTab(bgWs);
            if (currentTab.id !== initialTab.id) {
                finalTab = currentTab;
                break;
            }
        }

        expect(finalTab).not.toBeNull();
        console.log(`After 3B: switched to tab${tabIds.indexOf(finalTab.id)} (id: ${finalTab.id})`);

        // Should have switched to tab1 (3 steps back from tab4)
        expect(finalTab.id).toBe(tabIds[1]);
        console.log(`✓ 3B correctly went back three steps (tab4 -> tab1)`);
    });

    test('B command executes without throwing errors', async () => {
        // Basic smoke test: B should execute without errors
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Send B command
        await sendKey(pageWs, 'B');

        // Wait for command processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify browser is still in a valid state
        const afterB = await getActiveTab(bgWs);
        console.log(`After B: index ${afterB.index}, id ${afterB.id}`);

        expect(afterB).not.toBeNull();
        expect(afterB.id).toBeDefined();
        expect(tabIds).toContain(afterB.id);
        console.log(`✓ Browser in valid state after B command`);
    });
});
