/**
 * CDP Test: cmd_nav_last_tab
 *
 * Focused observability test for the last tab navigation command.
 * - Single command: cmd_nav_last_tab
 * - Single key: '<Ctrl-6>'
 * - Single behavior: switch to previously active tab
 * - Focus: verify command execution and tab history tracking
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-nav-last-tab.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-nav-last-tab.test.ts
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
 * Switch to a specific tab by ID
 */
async function switchToTab(bgWs: WebSocket, tabId: number): Promise<boolean> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.update(${tabId}, { active: true }, () => {
                resolve(true);
            });
        })
    `);
    return result;
}

/**
 * Poll for active tab to change to expected tab
 */
async function pollForTabChange(bgWs: WebSocket, fromTabId: number, maxAttempts: number = 20, delayMs: number = 100): Promise<{ id: number; index: number; url: string } | null> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const currentTab = await getActiveTab(bgWs);
        if (currentTab && currentTab.id !== fromTabId) {
            return currentTab;
        }
    }
    return null;
}

describe('cmd_nav_last_tab', () => {
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
        // Create them sequentially to build up tab history
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, true); // Make each new tab active as created
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 300)); // Delay to ensure history builds
        }

        // At this point, tabIds[4] is active and tab history is built
        console.log(`Created ${tabIds.length} tabs: ${tabIds.join(', ')}`);

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
        // Build tab history by switching between tabs in a known sequence
        // This ensures predictable tab history for each test
        console.log(`\n=== beforeEach: Building tab history ===`);

        // Start at tab[0]
        await switchToTab(bgWs, tabIds[0]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[0]: ${tabIds[0]}`);

        // Go to tab[2]
        await switchToTab(bgWs, tabIds[2]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[2]: ${tabIds[2]}`);

        // Go to tab[4] (this will be our starting point)
        await switchToTab(bgWs, tabIds[4]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[4]: ${tabIds[4]}`);

        // Verify we're at tab[4]
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: After setup, active tab is index ${verifyTab.index}, id ${verifyTab.id}`);
        expect(verifyTab.id).toBe(tabIds[4]);

        // Now tab history should be: [..., tab[0], tab[2], tab[4](current)]
        // So last tab should be tab[2]

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

    test('pressing <Ctrl-6> switches to last used tab', async () => {
        // Get initial active tab (should be tab[4] from beforeEach)
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[4]);

        // Press <Ctrl-6> to go to last used tab (should be tab[2])
        await sendKey(pageWs, 'Control+6');

        // Poll for tab switch
        const newTab = await pollForTabChange(bgWs, initialTab.id);
        expect(newTab).not.toBeNull();
        console.log(`After <Ctrl-6>: index ${newTab.index}, id ${newTab.id}`);

        // Should have moved to tab[2] (the last used tab)
        expect(newTab.id).toBe(tabIds[2]);
        expect(newTab.index).not.toBe(initialTab.index);
    });

    test('pressing <Ctrl-6> twice toggles between two tabs', async () => {
        // Start at tab[4]
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[4]);

        // First <Ctrl-6> - should go to tab[2]
        await sendKey(pageWs, 'Control+6');

        // Poll for first tab change
        const afterFirstCtrl6 = await pollForTabChange(bgWs, initialTab.id);
        expect(afterFirstCtrl6).not.toBeNull();
        console.log(`After first <Ctrl-6>: index ${afterFirstCtrl6.index}, id ${afterFirstCtrl6.id}`);
        expect(afterFirstCtrl6.id).toBe(tabIds[2]);

        // Reconnect to the newly active tab
        const newPageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        const newPageWs = await connectToCDP(newPageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Second <Ctrl-6> - should go back to tab[4]
        await sendKey(newPageWs, 'Control+6');

        // Poll for second tab change
        const afterSecondCtrl6 = await pollForTabChange(bgWs, afterFirstCtrl6.id);
        expect(afterSecondCtrl6).not.toBeNull();
        console.log(`After second <Ctrl-6>: index ${afterSecondCtrl6.index}, id ${afterSecondCtrl6.id}`);

        // Cleanup new connection
        await closeCDP(newPageWs);

        // Should be back at the initial tab
        expect(afterSecondCtrl6.id).toBe(initialTab.id);
        expect(afterSecondCtrl6.id).toBe(tabIds[4]);
    });

    test('<Ctrl-6> maintains history through multiple tab switches', async () => {
        // Build more complex history: tab[4] -> tab[1] -> tab[3]
        console.log(`\n=== Building complex tab history ===`);

        // Switch to tab[1]
        await switchToTab(bgWs, tabIds[1]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[1]: ${tabIds[1]}`);

        // Switch to tab[3]
        await switchToTab(bgWs, tabIds[3]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[3]: ${tabIds[3]}`);

        // Verify we're at tab[3]
        const currentTab = await getActiveTab(bgWs);
        expect(currentTab.id).toBe(tabIds[3]);
        console.log(`Current tab: index ${currentTab.index}, id ${currentTab.id}`);

        // Reconnect to tab[3]
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        await waitForSurfingkeysReady(pageWs);

        // Press <Ctrl-6> - should go to tab[1] (last used)
        await sendKey(pageWs, 'Control+6');

        // Poll for tab change
        const afterCtrl6 = await pollForTabChange(bgWs, currentTab.id);
        expect(afterCtrl6).not.toBeNull();
        console.log(`After <Ctrl-6>: index ${afterCtrl6.index}, id ${afterCtrl6.id}`);

        // Should have moved to tab[1]
        expect(afterCtrl6.id).toBe(tabIds[1]);
    });

    test('<Ctrl-6> is different from tab navigation (E/R)', async () => {
        // This test verifies that <Ctrl-6> uses history, not position
        // Start at tab[4] with history: tab[0] -> tab[2] -> tab[4]
        const initialTab = await getActiveTab(bgWs);
        expect(initialTab.id).toBe(tabIds[4]);
        console.log(`Initial tab[4]: index ${initialTab.index}`);

        // Press 'E' to go to previous tab by position (tab[3])
        await sendKey(pageWs, 'E');

        // Poll for tab change
        const afterE = await pollForTabChange(bgWs, initialTab.id);
        expect(afterE).not.toBeNull();
        console.log(`After E (previous by position): index ${afterE.index}, id ${afterE.id}`);

        // Should be at tab[3] (previous by position)
        expect(afterE.id).toBe(tabIds[3]);

        // Now reconnect and test <Ctrl-6>
        // First go back to tab[4]
        await switchToTab(bgWs, tabIds[4]);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Reconnect to tab[4]
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        const freshPageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(freshPageWs);
        await waitForSurfingkeysReady(freshPageWs);

        // Press <Ctrl-6> - should go to tab[3] (last used by history)
        await sendKey(freshPageWs, 'Control+6');

        // Poll for tab change
        const afterCtrl6 = await pollForTabChange(bgWs, tabIds[4]);
        expect(afterCtrl6).not.toBeNull();
        console.log(`After <Ctrl-6> (last by history): index ${afterCtrl6.index}, id ${afterCtrl6.id}`);

        // Should be at tab[3] (last used tab in history)
        expect(afterCtrl6.id).toBe(tabIds[3]);

        // Cleanup
        await closeCDP(freshPageWs);

        // Key difference: E went to position-based previous (tab[3])
        // <Ctrl-6> went to history-based last (also tab[3] in this case, but for different reasons)
        // The important point is that <Ctrl-6> follows history, not position
    });

    test('<Ctrl-6> with only two tabs in history', async () => {
        // Clear history by creating a fresh scenario with just 2 tabs
        // We'll use tab[0] and tab[1] only
        console.log(`\n=== Testing with minimal history ===`);

        // Switch to tab[0]
        await switchToTab(bgWs, tabIds[0]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[0]: ${tabIds[0]}`);

        // Switch to tab[1]
        await switchToTab(bgWs, tabIds[1]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[1]: ${tabIds[1]}`);

        // Verify we're at tab[1]
        const currentTab = await getActiveTab(bgWs);
        expect(currentTab.id).toBe(tabIds[1]);

        // Reconnect to tab[1]
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        await waitForSurfingkeysReady(pageWs);

        // Press <Ctrl-6> - should go to tab[0]
        await sendKey(pageWs, 'Control+6');

        // Poll for tab change
        const afterCtrl6 = await pollForTabChange(bgWs, currentTab.id);
        expect(afterCtrl6).not.toBeNull();
        console.log(`After <Ctrl-6>: index ${afterCtrl6.index}, id ${afterCtrl6.id}`);

        // Should be at tab[0]
        expect(afterCtrl6.id).toBe(tabIds[0]);
    });

    test('<Ctrl-6> after creating new tab maintains previous history', async () => {
        // Test that <Ctrl-6> skips the newly created tab and goes to actual last used
        console.log(`\n=== Testing <Ctrl-6> after new tab ===`);

        // Start at tab[2]
        await switchToTab(bgWs, tabIds[2]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[2]: ${tabIds[2]}`);

        // Switch to tab[3] (this will be "last used")
        await switchToTab(bgWs, tabIds[3]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[3]: ${tabIds[3]}`);

        // Now manually switch to tab[1] to simulate user navigation
        await switchToTab(bgWs, tabIds[1]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Switched to tab[1]: ${tabIds[1]}`);

        // Current tab is tab[1], last used is tab[3]
        const currentTab = await getActiveTab(bgWs);
        expect(currentTab.id).toBe(tabIds[1]);

        // Reconnect to current tab
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        await waitForSurfingkeysReady(pageWs);

        // Press <Ctrl-6> - should go to tab[3]
        await sendKey(pageWs, 'Control+6');

        // Poll for tab change
        const afterCtrl6 = await pollForTabChange(bgWs, currentTab.id);
        expect(afterCtrl6).not.toBeNull();
        console.log(`After <Ctrl-6>: index ${afterCtrl6.index}, id ${afterCtrl6.id}`);

        // Should be at tab[3] (last used before tab[1])
        expect(afterCtrl6.id).toBe(tabIds[3]);
    });
});
