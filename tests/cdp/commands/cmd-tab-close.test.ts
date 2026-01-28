/**
 * CDP Test: cmd_tab_close
 *
 * Focused observability test for the tab close command.
 * - Single command: cmd_tab_close
 * - Single key: 'x'
 * - Single behavior: close current tab
 * - Focus: verify tab closure and focus switching
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-close.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-close.test.ts
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
 * Get all tabs in the current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string; active: boolean }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(tab => ({
                    id: tab.id,
                    index: tab.index,
                    url: tab.url,
                    active: tab.active
                })));
            });
        })
    `);
    return result;
}

/**
 * Count tabs in the current window
 */
async function countTabs(bgWs: WebSocket): Promise<number> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.length);
            });
        })
    `);
    return result;
}

describe('cmd_tab_close', () => {
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
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 2); // Make tab 2 active (middle tab)
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

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Find a tab that still exists for reset
        let resetTabId = tabIds[2];
        const allTabs = await getAllTabs(bgWs);
        const existingTestTabs = allTabs.filter(t => tabIds.includes(t.id));

        if (existingTestTabs.length > 0) {
            // Use the middle tab if it exists, otherwise use the first available test tab
            const middleTab = existingTestTabs.find(t => t.id === tabIds[2]);
            resetTabId = middleTab ? middleTab.id : existingTestTabs[0].id;
        }

        // Reset to the chosen tab
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${resetTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
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
        // Cleanup - close all created tabs
        for (const tabId of tabIds) {
            try {
                await closeTab(bgWs, tabId);
            } catch (e) {
                // Tab might already be closed
            }
        }

        if (pageWs) {
            try {
                await closeCDP(pageWs);
            } catch (e) {
                // Connection may already be closed
            }
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('pressing x closes current tab', async () => {
        const initialTab = await getActiveTab(bgWs);
        const initialCount = await countTabs(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, count ${initialCount}`);

        // Send x key
        await sendKey(pageWs, 'x');

        // Wait and poll for tab to close (check every 500ms for up to 15 seconds)
        let tabClosed = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const currentCount = await countTabs(bgWs);
            console.log(`Poll ${i}: count is ${currentCount}`);
            if (currentCount < initialCount) {
                tabClosed = true;
                break;
            }
        }

        expect(tabClosed).toBe(true);

        // Verify count decreased by exactly 1
        const finalCount = await countTabs(bgWs);
        expect(finalCount).toBe(initialCount - 1);
    });

    test('pressing x twice closes two tabs', async () => {
        const initialCount = await countTabs(bgWs);
        console.log(`Initial count: ${initialCount}`);

        // Close first tab
        await sendKey(pageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Wait for first tab to close
        let firstClosed = false;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const currentCount = await countTabs(bgWs);
            if (currentCount < initialCount) {
                firstClosed = true;
                console.log(`First tab closed, count: ${currentCount}`);
                break;
            }
        }

        expect(firstClosed).toBe(true);
        const afterFirstCount = await countTabs(bgWs);

        // Reconnect to new active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {}
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        const newPageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Close second tab
        await sendKey(newPageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Wait for second tab to close
        let secondClosed = false;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const currentCount = await countTabs(bgWs);
            if (currentCount < afterFirstCount) {
                secondClosed = true;
                console.log(`Second tab closed, count: ${currentCount}`);
                break;
            }
        }

        expect(secondClosed).toBe(true);

        // Cleanup
        await closeCDP(newPageWs);

        // Verify total count decreased by 2
        const finalCount = await countTabs(bgWs);
        expect(finalCount).toBe(initialCount - 2);
    });

    test('focus switches to another tab after close', async () => {
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial active tab: ${initialTab.id}`);

        // Close current tab
        await sendKey(pageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Wait for tab to close
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const allTabs = await getAllTabs(bgWs);
            const stillExists = allTabs.some(t => t.id === initialTab.id);
            if (!stillExists) {
                console.log(`Tab ${initialTab.id} closed`);
                break;
            }
        }

        // Verify a different tab is now active
        const newActiveTab = await getActiveTab(bgWs);
        console.log(`New active tab: ${newActiveTab.id}`);
        expect(newActiveTab.id).not.toBe(initialTab.id);
    });

    test('other tabs remain open after one closes', async () => {
        const initialTabs = await getAllTabs(bgWs);
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial: ${initialTabs.length} tabs`);

        // Close current tab
        await sendKey(pageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Wait for tab to close
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const currentCount = await countTabs(bgWs);
            if (currentCount < initialTabs.length) {
                console.log(`Tab closed, count now: ${currentCount}`);
                break;
            }
        }

        // Verify all other tabs still exist
        const finalTabs = await getAllTabs(bgWs);
        console.log(`Final: ${finalTabs.length} tabs`);

        for (const tab of initialTabs) {
            if (tab.id !== initialTab.id) {
                const stillExists = finalTabs.some(t => t.id === tab.id);
                expect(stillExists).toBe(true);
            }
        }

        // Verify exactly one tab was removed
        expect(finalTabs.length).toBe(initialTabs.length - 1);
    });
});
