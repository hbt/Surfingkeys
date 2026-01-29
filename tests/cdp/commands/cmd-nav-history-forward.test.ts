/**
 * CDP Test: cmd_nav_history_forward
 *
 * Focused observability test for the history forward command.
 * - Single command: cmd_nav_history_forward
 * - Single key: 'D' (Shift+d)
 * - Single behavior: navigate forward in browser history
 * - Focus: verify command execution and history navigation without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-nav-history-forward.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-nav-history-forward.test.ts
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
    waitForSurfingkeysReady,
    getPageURL
} from '../utils/browser-actions';
import { waitForCDPEvent } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Get current URL of a tab via background API
 */
async function getTabURL(bgWs: WebSocket, tabId: number): Promise<string> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${tabId}, (tab) => {
                resolve(tab.url);
            });
        })
    `);
    return result;
}

/**
 * Navigate tab to a URL using chrome.tabs.update and wait for completion
 */
async function navigateTabAndWait(
    bgWs: WebSocket,
    tabId: number,
    url: string,
    timeoutMs: number = 5000
): Promise<void> {
    // Update tab URL
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.update(${tabId}, { url: '${url}' }, (tab) => {
                resolve(tab.id);
            });
        })
    `);

    // Poll for URL to change
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const currentUrl = await getTabURL(bgWs, tabId);
        if (currentUrl === url || currentUrl.includes(url)) {
            // Wait for page to settle
            await new Promise(resolve => setTimeout(resolve, 300));
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for tab to navigate to: ${url}`);
}

describe('cmd_nav_history_forward', () => {
    // Use actual fixture HTML files to ensure Surfingkeys is injected
    const PAGE_1 = 'http://127.0.0.1:9873/scroll-test.html';
    const PAGE_2 = 'http://127.0.0.1:9873/form-test.html';
    const PAGE_3 = 'http://127.0.0.1:9873/table-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
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

        // Create tab with initial page
        tabId = await createTab(bgWs, PAGE_1, true);

        // Find and connect to content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Reset to PAGE_1 to ensure clean state for each test
        console.log('beforeEach: Resetting to PAGE_1...');
        await navigateTabAndWait(bgWs, tabId, PAGE_1);
        const currentUrl = await getTabURL(bgWs, tabId);
        console.log(`beforeEach: Now at ${currentUrl}`);

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
        // Cleanup
        if (tabId && bgWs) {
            await closeTab(bgWs, tabId);
        }

        if (pageWs) {
            await closeCDP(pageWs);
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('pressing D navigates forward in history', async () => {
        // Build history: navigate from PAGE_1 -> PAGE_2
        console.log('Navigating from PAGE_1 to PAGE_2...');
        await navigateTabAndWait(bgWs, tabId, PAGE_2);

        const page2Url = await getTabURL(bgWs, tabId);
        expect(page2Url).toBe(PAGE_2);
        console.log(`At PAGE_2: ${page2Url}`);

        // Go back to PAGE_1 to create forward history
        console.log('Going back to PAGE_1 using history.go(-1)...');
        await executeInTarget(pageWs, 'history.go(-1)');

        // Poll for URL to change back to PAGE_1
        let startTime = Date.now();
        let backUrl = '';
        while (Date.now() - startTime < 5000) {
            backUrl = await getTabURL(bgWs, tabId);
            if (backUrl.includes('scroll-test.html')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        expect(backUrl).toContain('scroll-test.html');
        console.log(`Back at PAGE_1: ${backUrl}`);

        // Press 'D' to go forward (Shift+d)
        console.log('Pressing D to go forward...');
        await sendKey(pageWs, 'D');

        // Poll for URL to change forward to PAGE_2
        startTime = Date.now();
        let forwardUrl = '';
        while (Date.now() - startTime < 5000) {
            forwardUrl = await getTabURL(bgWs, tabId);
            if (forwardUrl === PAGE_2) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Verify we're forward on PAGE_2
        expect(forwardUrl).toBe(PAGE_2);
        console.log(`Successfully navigated forward to PAGE_2: ${forwardUrl}`);
    });

    test('pressing D twice navigates forward two pages', async () => {
        // Build history: PAGE_1 -> PAGE_2 -> PAGE_3
        console.log('Building history: PAGE_1 -> PAGE_2 -> PAGE_3...');

        await navigateTabAndWait(bgWs, tabId, PAGE_2);
        console.log(`At PAGE_2: ${await getTabURL(bgWs, tabId)}`);

        await navigateTabAndWait(bgWs, tabId, PAGE_3);
        const page3Url = await getTabURL(bgWs, tabId);
        expect(page3Url).toBe(PAGE_3);
        console.log(`At PAGE_3: ${page3Url}`);

        // Go back twice to PAGE_1
        console.log('Going back twice to PAGE_1...');
        await executeInTarget(pageWs, 'history.go(-2)');

        // Poll for URL to change to PAGE_1
        let startTime = Date.now();
        let backUrl = '';
        while (Date.now() - startTime < 5000) {
            backUrl = await getTabURL(bgWs, tabId);
            if (backUrl.includes('scroll-test.html')) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        expect(backUrl).toContain('scroll-test.html');
        console.log(`Back at PAGE_1: ${backUrl}`);

        // Wait for Surfingkeys to be ready after navigation
        await waitForSurfingkeysReady(pageWs);

        // Press 'D' first time to go forward to PAGE_2
        console.log('Pressing D (first time) to go forward to PAGE_2...');
        await sendKey(pageWs, 'D');

        // Poll for URL to change to PAGE_2
        startTime = Date.now();
        let afterFirstForward = '';
        while (Date.now() - startTime < 5000) {
            afterFirstForward = await getTabURL(bgWs, tabId);
            if (afterFirstForward === PAGE_2) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        expect(afterFirstForward).toBe(PAGE_2);
        console.log(`After first D: ${afterFirstForward}`);

        // Press 'D' second time to go forward to PAGE_3
        console.log('Pressing D (second time) to go forward to PAGE_3...');
        await sendKey(pageWs, 'D');

        // Poll for URL to change to PAGE_3
        startTime = Date.now();
        let afterSecondForward = '';
        while (Date.now() - startTime < 5000) {
            afterSecondForward = await getTabURL(bgWs, tabId);
            if (afterSecondForward === PAGE_3) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        expect(afterSecondForward).toBe(PAGE_3);
        console.log(`After second D: ${afterSecondForward}`);
    });

    test.skip('D command respects repeatIgnore (2D does not go forward twice)', async () => {
        // TODO(test): This test is skipped pending investigation of repeatIgnore semantics
        // Similar to cmd_nav_history_back, need to verify if repeatIgnore prevents numeric repeats
        //
        // Build history: PAGE_1 -> PAGE_2 -> PAGE_3, then go back twice
        console.log('Building history for repeatIgnore test...');

        await navigateTabAndWait(bgWs, tabId, PAGE_2);
        await navigateTabAndWait(bgWs, tabId, PAGE_3);

        // Go back twice to PAGE_1
        await executeInTarget(pageWs, 'history.go(-2)');

        // Poll for URL to change to PAGE_1
        let startTime = Date.now();
        let backUrl = '';
        while (Date.now() - startTime < 5000) {
            backUrl = await getTabURL(bgWs, tabId);
            if (backUrl.includes('scroll-test.html')) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const startUrl = await getTabURL(bgWs, tabId);
        expect(startUrl).toContain('scroll-test.html');
        console.log(`Starting at PAGE_1: ${startUrl}`);

        // Press '2D' (should only go forward once due to repeatIgnore: true)
        console.log('Pressing 2D (should only go forward once due to repeatIgnore)...');

        // Send '2' followed by 'D'
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, 'D');

        // Poll for URL to change to PAGE_2 (NOT PAGE_3)
        startTime = Date.now();
        let finalUrl = '';
        while (Date.now() - startTime < 5000) {
            finalUrl = await getTabURL(bgWs, tabId);
            if (finalUrl === PAGE_2) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Should be at PAGE_2 (not PAGE_3), because repeat is ignored
        expect(finalUrl).toBe(PAGE_2);
        console.log(`After 2D: ${finalUrl} (correctly stayed at PAGE_2, not PAGE_3)`);
    });

    test('D does nothing when no forward history exists', async () => {
        // Create a fresh tab with no history
        const freshTabId = await createTab(bgWs, PAGE_2, true);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Connect to the fresh tab
        const freshPageWsUrl = await findContentPage('form-test.html');
        const freshPageWs = await connectToCDP(freshPageWsUrl);

        enableInputDomain(freshPageWs);
        await waitForSurfingkeysReady(freshPageWs);

        const initialUrl = await getTabURL(bgWs, freshTabId);
        console.log(`Fresh tab URL: ${initialUrl}`);

        // Press 'D' - should not navigate (no forward history)
        console.log('Pressing D on fresh tab (no forward history)...');
        await sendKey(freshPageWs, 'D');

        // Wait a bit to ensure no navigation happens
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify URL hasn't changed
        const finalUrl = await getTabURL(bgWs, freshTabId);
        expect(finalUrl).toBe(initialUrl);
        console.log(`URL unchanged: ${finalUrl} (correct - no forward history)`);

        // Cleanup
        await closeCDP(freshPageWs);
        await closeTab(bgWs, freshTabId);
    });
});
