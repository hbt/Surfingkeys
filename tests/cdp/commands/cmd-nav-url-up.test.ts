/**
 * CDP Test: cmd_nav_url_up
 *
 * Focused observability test for the URL path up command.
 * - Single command: cmd_nav_url_up
 * - Single key: 'gu'
 * - Single behavior: navigate up one level in URL path
 * - Focus: verify command execution and URL navigation using CDP events
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-nav-url-up.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-nav-url-up.test.ts
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
import { waitForCDPEvent } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Wait for page navigation to complete using CDP Page.frameNavigated
 * Returns the new URL after navigation
 */
async function waitForNavigation(ws: WebSocket, timeoutMs: number = 10000): Promise<string> {
    // Enable Page domain to receive navigation events
    ws.send(JSON.stringify({
        id: Math.floor(Math.random() * 100000),
        method: 'Page.enable'
    }));

    // Wait for Page.frameNavigated which signals a navigation has occurred
    const navEvent = await waitForCDPEvent(
        ws,
        (msg) => msg.method === 'Page.frameNavigated',
        timeoutMs
    );

    // Extract the new URL from the frame navigation event
    const newUrl = navEvent.params?.frame?.url;
    return newUrl || '';
}

/**
 * Get current page URL using CDP
 */
async function getCurrentUrl(ws: WebSocket): Promise<string> {
    const url = await executeInTarget(ws, 'window.location.href');
    return url;
}

describe('cmd_nav_url_up', () => {
    const BASE_URL = 'http://127.0.0.1:9873';
    const DEEP_PATH_URL = `${BASE_URL}/path/to/deep/page.html`;
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

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

        // Create fixture tab (we'll navigate it in tests)
        tabId = await createTab(bgWs, FIXTURE_URL, true);

        // Find and connect to content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Enable Page domain for navigation events
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Page.enable'
        }));

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
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

    test('pressing gu on deep path goes up one level', async () => {
        // Set up listener for navigation BEFORE navigating
        const setupNavPromise = waitForNavigation(pageWs, 10000);

        // Navigate to a deep path
        await executeInTarget(pageWs, `window.location.href = '${DEEP_PATH_URL}'`);

        // Wait for navigation to complete
        await setupNavPromise;

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);

        // Verify we're at the deep path
        const initialUrl = await getCurrentUrl(pageWs);
        expect(initialUrl).toBe(DEEP_PATH_URL);
        console.log(`Initial URL: ${initialUrl}`);

        // Set up listener for navigation event BEFORE pressing 'gu'
        const navPromise = waitForNavigation(pageWs, 10000);

        // Press 'g'
        await sendKey(pageWs, 'g', 50);
        // Press 'u'
        await sendKey(pageWs, 'u');

        // Wait for navigation to complete
        const newUrl = await navPromise;
        console.log(`After gu: ${newUrl}`);

        // Should have navigated up one level: /path/to/deep/page.html -> /path/to/deep
        expect(newUrl).toBe(`${BASE_URL}/path/to/deep`);

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);
    });

    test('pressing gu multiple times goes up multiple levels', async () => {
        // Set up listener for navigation BEFORE navigating
        const setupNavPromise = waitForNavigation(pageWs, 10000);

        // Navigate to a deep path
        await executeInTarget(pageWs, `window.location.href = '${DEEP_PATH_URL}'`);

        // Wait for navigation to complete
        await setupNavPromise;

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);

        const initialUrl = await getCurrentUrl(pageWs);
        expect(initialUrl).toBe(DEEP_PATH_URL);
        console.log(`Initial URL: ${initialUrl}`);

        // First gu: /path/to/deep/page.html -> /path/to/deep
        let navPromise = waitForNavigation(pageWs, 10000);
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'u');
        let newUrl = await navPromise;
        await waitForSurfingkeysReady(pageWs);
        console.log(`After 1st gu: ${newUrl}`);
        expect(newUrl).toBe(`${BASE_URL}/path/to/deep`);

        // Second gu: /path/to/deep -> /path/to
        navPromise = waitForNavigation(pageWs, 10000);
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'u');
        newUrl = await navPromise;
        await waitForSurfingkeysReady(pageWs);
        console.log(`After 2nd gu: ${newUrl}`);
        expect(newUrl).toBe(`${BASE_URL}/path/to`);

        // Third gu: /path/to -> /path
        navPromise = waitForNavigation(pageWs, 10000);
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'u');
        newUrl = await navPromise;
        await waitForSurfingkeysReady(pageWs);
        console.log(`After 3rd gu: ${newUrl}`);
        expect(newUrl).toBe(`${BASE_URL}/path`);
    });

    test('pressing 3gu goes up 3 levels at once', async () => {
        // Set up listener for navigation BEFORE navigating
        const setupNavPromise = waitForNavigation(pageWs, 10000);

        // Navigate to a deep path
        await executeInTarget(pageWs, `window.location.href = '${DEEP_PATH_URL}'`);

        // Wait for navigation to complete
        await setupNavPromise;

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);

        const initialUrl = await getCurrentUrl(pageWs);
        expect(initialUrl).toBe(DEEP_PATH_URL);
        console.log(`Initial URL: ${initialUrl}`);

        // Set up listener for navigation event
        const navPromise = waitForNavigation(pageWs, 10000);

        // Send '3' followed by 'g' and 'u' to create 3gu command
        await sendKey(pageWs, '3', 50);
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'u');

        // Wait for navigation to complete
        const newUrl = await navPromise;
        console.log(`After 3gu: ${newUrl}`);

        // Should have navigated up 3 levels: /path/to/deep/page.html -> /path
        // Level 1: /path/to/deep/page.html -> /path/to/deep
        // Level 2: /path/to/deep -> /path/to
        // Level 3: /path/to -> /path
        expect(newUrl).toBe(`${BASE_URL}/path`);

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);
    });

    test('pressing gu at root level stays at root', async () => {
        // Set up listener for navigation BEFORE navigating
        const setupNavPromise = waitForNavigation(pageWs, 10000);

        // Navigate to root
        await executeInTarget(pageWs, `window.location.href = '${BASE_URL}/'`);

        // Wait for navigation to complete
        await setupNavPromise;

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);

        const initialUrl = await getCurrentUrl(pageWs);
        console.log(`Initial URL at root: ${initialUrl}`);
        expect(initialUrl.startsWith(BASE_URL)).toBe(true);

        // Try pressing gu at root - should not navigate anywhere
        // We can't wait for navigation because there won't be one
        // Instead, just press the key and check URL hasn't changed
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'u');

        // Wait a bit for any potential navigation (there shouldn't be one)
        await new Promise(resolve => setTimeout(resolve, 500));

        const finalUrl = await getCurrentUrl(pageWs);
        console.log(`Final URL after gu at root: ${finalUrl}`);

        // URL should still be at root (may have trailing slash)
        const expectedUrls = [BASE_URL, `${BASE_URL}/`];
        expect(expectedUrls).toContain(finalUrl);
    });

    test('pressing gu handles trailing slash correctly', async () => {
        // Set up listener for navigation BEFORE navigating
        const setupNavPromise = waitForNavigation(pageWs, 10000);

        // Navigate to URL with trailing slash
        const urlWithSlash = `${BASE_URL}/path/to/`;
        await executeInTarget(pageWs, `window.location.href = '${urlWithSlash}'`);

        // Wait for navigation to complete
        await setupNavPromise;

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);

        const initialUrl = await getCurrentUrl(pageWs);
        console.log(`Initial URL with trailing slash: ${initialUrl}`);

        // Set up listener for navigation event
        const navPromise = waitForNavigation(pageWs, 10000);

        // Press 'gu'
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'u');

        // Wait for navigation
        const newUrl = await navPromise;
        console.log(`After gu on URL with trailing slash: ${newUrl}`);

        // Should go up one level: /path/to/ -> /path
        expect(newUrl).toBe(`${BASE_URL}/path`);

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);
    });

    test('pressing 2gu from 2-level path goes to root', async () => {
        // Set up listener for navigation BEFORE navigating
        const setupNavPromise = waitForNavigation(pageWs, 10000);

        // Navigate to a 2-level path
        const twoLevelUrl = `${BASE_URL}/path/to`;
        await executeInTarget(pageWs, `window.location.href = '${twoLevelUrl}'`);

        // Wait for navigation to complete
        await setupNavPromise;

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);

        const initialUrl = await getCurrentUrl(pageWs);
        expect(initialUrl).toBe(twoLevelUrl);
        console.log(`Initial URL: ${initialUrl}`);

        // Set up listener for navigation event
        const navPromise = waitForNavigation(pageWs, 10000);

        // Send '2gu' command
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'u');

        // Wait for navigation
        const newUrl = await navPromise;
        console.log(`After 2gu: ${newUrl}`);

        // Should be at root (origin only, may have trailing slash)
        // /path/to -> /path -> / (which becomes just the origin)
        const expectedUrls = [BASE_URL, `${BASE_URL}/`];
        expect(expectedUrls).toContain(newUrl);

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);
    });
});
