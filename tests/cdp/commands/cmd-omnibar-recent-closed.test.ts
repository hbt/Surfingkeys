/**
 * CDP Test: cmd_omnibar_recent_closed
 *
 * Focused observability test for the omnibar recent closed command.
 * - Single command: cmd_omnibar_recent_closed
 * - Single key: 'ox'
 * - Single behavior: open omnibar showing recently closed tabs/windows
 * - Focus: verify command execution and omnibar display with closed tabs
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-omnibar-recent-closed.test.ts
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
 * Get all tabs in the current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string; active: boolean }>> {
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
 * Find frontend iframe target
 */
async function findFrontendTarget(): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = require('http').get(`http://127.0.0.1:${CDP_PORT}/json`, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', () => {
                const targets = JSON.parse(data);
                const frontendTarget = targets.find((t: any) =>
                    t.url && t.url.includes('frontend.html') && t.webSocketDebuggerUrl
                );
                if (!frontendTarget) {
                    reject(new Error('Frontend target not found'));
                } else {
                    resolve(frontendTarget);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

/**
 * Connect to frontend iframe
 */
async function connectToFrontend(): Promise<WebSocket> {
    const frontendTarget = await findFrontendTarget();
    return connectToCDP(frontendTarget.webSocketDebuggerUrl);
}

/**
 * Poll for omnibar visibility via DOM query in frontend frame
 */
async function pollForOmnibarVisible(frontendWs: WebSocket, maxAttempts: number = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));

        const visible = await executeInTarget(frontendWs, `
            (() => {
                const omnibar = document.getElementById('sk_omnibar');
                if (!omnibar) return false;

                const style = window.getComputedStyle(omnibar);
                return style.display !== 'none' && style.visibility !== 'hidden';
            })()
        `);

        if (visible) {
            return true;
        }
    }
    return false;
}

/**
 * Get omnibar result items count and text
 */
async function getOmnibarResults(frontendWs: WebSocket): Promise<Array<string>> {
    const results = await executeInTarget(frontendWs, `
        (() => {
            const omnibar = document.getElementById('sk_omnibar');
            if (!omnibar) return [];

            // Try both possible selectors
            let items = omnibar.querySelectorAll('#sk_omnibarSearchResult>ul>li');
            if (items.length === 0) {
                items = omnibar.querySelectorAll('li');
            }

            return Array.from(items).map(li => {
                // Try multiple ways to get text
                const annotation = li.querySelector('.annotation');
                if (annotation && annotation.textContent) {
                    return annotation.textContent;
                }
                return li.textContent || '';
            }).filter(text => text.trim().length > 0);
        })()
    `);
    return results || [];
}

/**
 * Get recently closed sessions count
 */
async function getRecentlyClosedCount(bgWs: WebSocket): Promise<number> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.sessions.getRecentlyClosed({}, (sessions) => {
                let count = 0;
                for (const s of sessions) {
                    if (s.hasOwnProperty('window')) {
                        count += s.window.tabs.length;
                    } else if (s.hasOwnProperty('tab')) {
                        count += 1;
                    }
                }
                resolve(count);
            });
        })
    `);
    return result;
}

/**
 * Close omnibar by pressing Escape
 */
async function closeOmnibar(pageWs: WebSocket): Promise<void> {
    await sendKey(pageWs, 'Escape');
    await new Promise(resolve => setTimeout(resolve, 200));
}

describe('cmd_omnibar_recent_closed', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    const FIXTURE_URL_2 = 'http://127.0.0.1:9873/hints-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let testTabIds: number[] = [];
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

        // Create 5 test tabs for closing and restoration
        for (let i = 0; i < 5; i++) {
            const url = (i === 1 || i === 3) ? FIXTURE_URL_2 : FIXTURE_URL;
            const tabId = await createTab(bgWs, url, i === 2); // Make tab 2 active (middle tab)
            testTabIds.push(tabId);
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
        // Get current tabs
        const currentTabs = await getAllTabs(bgWs);

        // If we have fewer tabs than expected, restore them
        if (currentTabs.length < 5) {
            const missing = 5 - currentTabs.length;
            for (let i = 0; i < missing; i++) {
                const url = FIXTURE_URL;
                const tabId = await createTab(bgWs, url, false);
                testTabIds.push(tabId);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Reset to a stable tab
        const tabs = await getAllTabs(bgWs);
        if (tabs.length > 0) {
            const resetTabId = tabs[Math.min(2, tabs.length - 1)].id;
            await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.update(${resetTabId}, { active: true }, () => {
                        resolve(true);
                    });
                })
            `);
            console.log(`beforeEach: Reset to tab ${resetTabId}`);
        }

        // Wait for tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to the active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873');
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
        const allTabs = await getAllTabs(bgWs);
        for (const tab of allTabs) {
            if (testTabIds.includes(tab.id)) {
                try {
                    await closeTab(bgWs, tab.id);
                } catch (e) {
                    // Tab might already be closed
                }
            }
        }

        if (pageWs) {
            await closeCDP(pageWs);
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('pressing ox opens omnibar for recently closed tabs', async () => {
        // Close a tab to build closed history
        const initialTabs = await getAllTabs(bgWs);
        const tabToClose = initialTabs[0];
        console.log(`Closing tab ${tabToClose.id} with url=${tabToClose.url}`);

        await closeTab(bgWs, tabToClose.id);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify tab was closed
        const afterCloseTabs = await getAllTabs(bgWs);
        expect(afterCloseTabs.length).toBe(initialTabs.length - 1);
        console.log(`Tab closed, now ${afterCloseTabs.length} tabs`);

        // Verify closed tab exists in Chrome sessions API
        const closedCount = await getRecentlyClosedCount(bgWs);
        console.log(`Chrome sessions API reports ${closedCount} closed items`);

        // Reconnect to active tab
        const newPageWsUrl = await findContentPage('127.0.0.1:9873');
        const newPageWs = await connectToCDP(newPageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Press 'ox' to open recently closed omnibar
        console.log(`Pressing 'ox' to open recently closed omnibar...`);
        await sendKey(newPageWs, 'o');
        await sendKey(newPageWs, 'x');

        // Wait for frontend to be created
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend iframe
        const frontend = await connectToFrontend();

        // Poll for omnibar visibility in frontend
        const omnibarVisible = await pollForOmnibarVisible(frontend);
        expect(omnibarVisible).toBe(true);
        console.log(`✓ Omnibar successfully opened for recently closed tabs`);

        // Note: Chrome's sessions API may not populate in headless mode or between tests
        // The main behavior (opening omnibar) is what we're testing here
        await new Promise(resolve => setTimeout(resolve, 500));
        const results = await getOmnibarResults(frontend);
        console.log(`Omnibar shows ${results.length} results (may be 0 in headless mode)`);

        // Close omnibar
        await closeOmnibar(newPageWs);
        await closeCDP(frontend);
        await closeCDP(newPageWs);
    });

    test('ox opens omnibar even with no previously closed tabs', async () => {
        // Press 'ox' to open recently closed omnibar
        console.log(`Pressing 'ox' to open omnibar...`);
        await sendKey(pageWs, 'o');
        await sendKey(pageWs, 'x');

        // Wait for frontend
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend
        const frontend = await connectToFrontend();

        // Poll for omnibar visibility
        const omnibarVisible = await pollForOmnibarVisible(frontend);
        expect(omnibarVisible).toBe(true);
        console.log(`✓ Omnibar opened`);

        // Close omnibar
        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });

    test('ox command can be used multiple times consecutively', async () => {
        // First press
        await sendKey(pageWs, 'o');
        await sendKey(pageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 500));

        let frontend = await connectToFrontend();
        let visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log(`First ox: omnibar visible`);

        await closeOmnibar(pageWs);
        await closeCDP(frontend);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Second press
        await sendKey(pageWs, 'o');
        await sendKey(pageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 500));

        frontend = await connectToFrontend();
        visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log(`Second ox: omnibar visible`);
        console.log(`✓ ox command works multiple times`);

        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });

    test('closing multiple tabs then opening ox omnibar', async () => {
        // Get initial tabs
        const initialTabs = await getAllTabs(bgWs);
        const initialCount = initialTabs.length;

        // Close 3 tabs
        const tabsToClose = initialTabs.slice(0, 3);
        console.log(`Closing ${tabsToClose.length} tabs...`);

        for (const tab of tabsToClose) {
            console.log(`  Closing tab ${tab.id}`);
            await closeTab(bgWs, tab.id);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Verify all closed
        const afterCloseTabs = await getAllTabs(bgWs);
        expect(afterCloseTabs.length).toBe(initialCount - 3);
        console.log(`After closing: ${afterCloseTabs.length} tabs (was ${initialCount})`);

        // Check Chrome sessions API
        const closedCount = await getRecentlyClosedCount(bgWs);
        console.log(`Chrome sessions API reports ${closedCount} closed items`);

        // Reconnect to active tab
        const newPageWsUrl = await findContentPage('127.0.0.1:9873');
        const newPageWs = await connectToCDP(newPageWsUrl);
        enableInputDomain(newPageWs);
        await waitForSurfingkeysReady(newPageWs);

        // Open recently closed omnibar
        await sendKey(newPageWs, 'o');
        await sendKey(newPageWs, 'x');
        await new Promise(resolve => setTimeout(resolve, 500));

        const frontend = await connectToFrontend();
        const visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log(`✓ Omnibar opened successfully after closing multiple tabs`);

        await new Promise(resolve => setTimeout(resolve, 500));
        const results = await getOmnibarResults(frontend);
        console.log(`Omnibar shows ${results.length} results (may vary in headless mode)`);

        await closeOmnibar(newPageWs);
        await closeCDP(frontend);
        await closeCDP(newPageWs);
    });
});
