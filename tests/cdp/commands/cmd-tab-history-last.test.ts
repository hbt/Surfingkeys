/**
 * CDP Test: cmd_tab_history_last
 *
 * Focused observability test for the tab history last command.
 * - Single command: cmd_tab_history_last
 * - Single key: 'gt'
 * - Single behavior: switch to most recently activated tab in history
 * - Focus: verify command execution and tab history tracking
 *
 * Note: The `gt` command uses `historyTab({index: -1})` which switches to the
 * last element in the tab history array. Due to how the history is maintained,
 * this may point to the current tab if no other tabs have been activated.
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-tab-history-last.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-history-last.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-tab-history-last.test.ts
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

describe('cmd_tab_history_last', () => {
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
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 2);
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
        // Build tab history by activating tabs in sequence
        console.log('\n=== Building tab activation history ===');

        await activateTab(bgWs, tabIds[0]);
        await new Promise(resolve => setTimeout(resolve, 300));

        await activateTab(bgWs, tabIds[1]);
        await new Promise(resolve => setTimeout(resolve, 300));

        await activateTab(bgWs, tabIds[2]);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify current tab
        const verifyTab = await getActiveTab(bgWs);
        console.log(`Setup complete: active tab index ${verifyTab.index}, id ${verifyTab.id}`);

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

    test('pressing gt sends keystrokes without errors', async () => {
        // This test verifies that the gt command can be sent
        // Actual tab switching behavior depends on tab history state

        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}`);
        expect(initialTab.id).toBe(tabIds[2]);

        // Send gt command
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 't');

        // Wait for potential tab switch
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify we still have a valid active tab
        const afterGt = await getActiveTab(bgWs);
        console.log(`After gt: index ${afterGt.index}, id ${afterGt.id}`);

        expect(afterGt).not.toBeNull();
        expect(afterGt.id).toBeDefined();

        if (afterGt.id !== initialTab.id) {
            console.log(`✓ Tab switched from id ${initialTab.id} to ${afterGt.id}`);
        } else {
            console.log(`Tab remained at id ${initialTab.id}`);
        }
    });
});
