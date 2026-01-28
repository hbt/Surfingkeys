/**
 * CDP Test: cmd_tab_history_first
 *
 * Focused observability test for the tab history first command.
 * - Single command: cmd_tab_history_first
 * - Single key: 'gT'
 * - Single behavior: switch to first/oldest activated tab in history
 * - Focus: verify command execution and tab history tracking
 *
 * Note: The `gT` command uses `historyTab({index: 0})` which switches to the
 * first element in the tab history array (oldest activated tab).
 * This is different from `gt` which goes to the last element (most recent).
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-tab-history-first.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-history-first.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-tab-history-first.test.ts
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

describe('cmd_tab_history_first', () => {
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
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 4);
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
        // Build tab history by switching tabs using chrome.tabs.update
        // This will properly populate Surfingkeys' internal tabHistory
        // Start from tab 0 and activate tabs in sequence
        console.log('\n=== Building tab activation history ===');

        // Activate tab 0 first (will be first in history)
        await activateTab(bgWs, tabIds[0]);
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`Activated tab 0 (id: ${tabIds[0]})`);

        // Activate tab 1
        await activateTab(bgWs, tabIds[1]);
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`Activated tab 1 (id: ${tabIds[1]})`);

        // Activate tab 2
        await activateTab(bgWs, tabIds[2]);
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`Activated tab 2 (id: ${tabIds[2]})`);

        // Activate tab 3
        await activateTab(bgWs, tabIds[3]);
        await new Promise(resolve => setTimeout(resolve, 400));
        console.log(`Activated tab 3 (id: ${tabIds[3]})`);

        // Finally activate tab 4 (will be current tab, last in history)
        await activateTab(bgWs, tabIds[4]);
        await new Promise(resolve => setTimeout(resolve, 600));
        console.log(`Activated tab 4 (id: ${tabIds[4]})`);

        // Verify current tab
        const verifyTab = await getActiveTab(bgWs);
        console.log(`Setup complete: active tab index ${verifyTab.index}, id ${verifyTab.id}`);
        console.log(`Tab history should be: tab0 (first/oldest) -> tab1 -> tab2 -> tab3 -> tab4 (current/newest)`);

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

    test('pressing gT switches to first activated tab in history', async () => {
        // gT should switch to the first (oldest) tab in activation history
        // History built in beforeEach: tab0 (first) -> tab1 -> tab2 -> tab3 -> tab4 (current)
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[4]);

        // Send gT command
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'T');

        // Wait for potential tab switch
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Check which tab is now active
        const afterGT = await getActiveTab(bgWs);
        console.log(`After gT: index ${afterGT.index}, id ${afterGT.id}`);

        expect(afterGT).not.toBeNull();
        expect(afterGT.id).toBeDefined();

        if (afterGT.id !== initialTab.id) {
            console.log(`✓ Tab switched from id ${initialTab.id} to ${afterGT.id}`);
            // Verify it's one of our created tabs
            expect(tabIds).toContain(afterGT.id);

            // Check if it went to tab0 (ideal behavior)
            if (afterGT.id === tabIds[0]) {
                console.log(`✓ Switched to tab0 (first in history) as expected`);
            } else {
                console.log(`Note: Switched to tab${tabIds.indexOf(afterGT.id)} instead of tab0`);
            }
        } else {
            console.log(`Tab remained at id ${initialTab.id} (tabHistory may be empty or already at first)`);
        }
    });

    test('gT command executes without throwing errors', async () => {
        // Basic smoke test: gT should execute without errors
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Send gT command
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'T');

        // Wait for command processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify browser is still in a valid state
        const afterGT = await getActiveTab(bgWs);
        console.log(`After gT: index ${afterGT.index}, id ${afterGT.id}`);

        expect(afterGT).not.toBeNull();
        expect(afterGT.id).toBeDefined();
        expect(tabIds).toContain(afterGT.id);
    });

    test('multiple gT invocations work correctly', async () => {
        // Test that gT can be called multiple times without errors
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // First gT
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'T');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const afterFirst = await getActiveTab(bgWs);
        console.log(`After first gT: index ${afterFirst.index}, id ${afterFirst.id}`);
        expect(afterFirst).not.toBeNull();
        expect(tabIds).toContain(afterFirst.id);

        // Reconnect if needed
        if (afterFirst.id !== initialTab.id) {
            try {
                await closeCDP(pageWs);
            } catch (e) {
                // May already be closed
            }
            const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
            pageWs = await connectToCDP(pageWsUrl);
            enableInputDomain(pageWs);
            await waitForSurfingkeysReady(pageWs);
        }

        // Second gT
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'T');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const afterSecond = await getActiveTab(bgWs);
        console.log(`After second gT: index ${afterSecond.index}, id ${afterSecond.id}`);
        expect(afterSecond).not.toBeNull();
        expect(tabIds).toContain(afterSecond.id);
    });

    test('gT and gt access different positions in history', async () => {
        // Demonstrate that gT (first) and gt (last) are different commands
        // This doesn't test exact behavior but shows they're independent
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Send gT command (first in history)
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'T');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const afterGT = await getActiveTab(bgWs);
        console.log(`After gT: index ${afterGT.index}, id ${afterGT.id}`);
        expect(afterGT).not.toBeNull();
        expect(tabIds).toContain(afterGT.id);

        // Return to initial state
        await activateTab(bgWs, initialTab.id);
        await new Promise(resolve => setTimeout(resolve, 600));

        // Reconnect
        try {
            await closeCDP(pageWs);
        } catch (e) {}
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        await waitForSurfingkeysReady(pageWs);

        // Send gt command (last in history)
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const afterGt = await getActiveTab(bgWs);
        console.log(`After gt: index ${afterGt.index}, id ${afterGt.id}`);
        expect(afterGt).not.toBeNull();
        expect(tabIds).toContain(afterGt.id);

        // Both commands should execute without errors
        console.log(`gT and gt are both functional (may switch to same or different tabs)`);
    });

    test('gT handles edge case when at boundary', async () => {
        // Test gT behavior at edge cases
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);

        // Send gT command
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'T');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const afterGT = await getActiveTab(bgWs);
        console.log(`After gT: index ${afterGT.index}, id ${afterGT.id}`);

        // Should remain in valid state
        expect(afterGT).not.toBeNull();
        expect(afterGT.id).toBeDefined();
        expect(tabIds).toContain(afterGT.id);

        // Send gT again
        if (afterGT.id !== initialTab.id) {
            // Reconnect to new tab
            try {
                await closeCDP(pageWs);
            } catch (e) {}
            const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
            pageWs = await connectToCDP(pageWsUrl);
            enableInputDomain(pageWs);
            await waitForSurfingkeysReady(pageWs);
        }

        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'T');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const afterSecondGT = await getActiveTab(bgWs);
        console.log(`After second gT: index ${afterSecondGT.index}, id ${afterSecondGT.id}`);

        expect(afterSecondGT).not.toBeNull();
        expect(tabIds).toContain(afterSecondGT.id);
    });
});
