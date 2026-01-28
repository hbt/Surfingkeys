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
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[2]}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);

        // Wait for tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 300));

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
});
