/**
 * CDP Test: cmd_nav_url_root
 *
 * Focused observability test for the navigate to URL root command.
 * - Single command: cmd_nav_url_root
 * - Single key: 'gU'
 * - Single behavior: navigate to URL origin (root)
 * - Focus: verify command execution and URL change using CDP events
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-nav-url-root.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-nav-url-root.test.ts
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
 * Wait for navigation to complete using CDP Page.frameNavigated
 * Returns when the page navigates to a new URL (full page load)
 */
async function waitForPageNavigation(ws: WebSocket, timeoutMs: number = 10000): Promise<any> {
    // Enable Page domain to receive navigation events
    ws.send(JSON.stringify({
        id: Math.floor(Math.random() * 100000),
        method: 'Page.enable'
    }));

    // Wait for Page.frameNavigated which signals a full page navigation
    return await waitForCDPEvent(
        ws,
        (msg) => msg.method === 'Page.frameNavigated',
        timeoutMs
    );
}

/**
 * Wait for page load to complete using CDP Page.loadEventFired
 */
async function waitForPageLoad(ws: WebSocket, timeoutMs: number = 10000): Promise<void> {
    // Enable Page domain
    ws.send(JSON.stringify({
        id: Math.floor(Math.random() * 100000),
        method: 'Page.enable'
    }));

    // Wait for Page.loadEventFired which signals document load completed
    await waitForCDPEvent(
        ws,
        (msg) => msg.method === 'Page.loadEventFired',
        timeoutMs
    );
}

/**
 * Get current page URL
 */
async function getCurrentURL(ws: WebSocket): Promise<string> {
    return await executeInTarget(ws, 'window.location.href');
}

/**
 * Get current page origin
 */
async function getCurrentOrigin(ws: WebSocket): Promise<string> {
    return await executeInTarget(ws, 'window.location.origin');
}

describe('cmd_nav_url_root', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    const ORIGIN = 'http://127.0.0.1:9873';

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

        // Create fixture tab with deep path
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

    test('pressing gU navigates to URL root from deep path', async () => {
        // Navigate to a deep URL path (404 page, but navigation still works)
        const deepPath = `${ORIGIN}/path/to/deep/page.html`;
        await executeInTarget(pageWs, `window.location.href = '${deepPath}'`);

        // Wait for navigation to complete and Surfingkeys to re-inject
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify we're at the deep path
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toBe(deepPath);
        console.log(`URL before gU: ${urlBefore}`);

        // Set up listener for navigation event BEFORE pressing 'gU'
        const navPromise = waitForPageNavigation(pageWs, 10000);

        // Press 'g' followed by 'U' to trigger cmd_nav_url_root
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'U');

        // Wait for navigation to complete
        const navEvent = await navPromise;
        console.log(`Navigation event detected: ${navEvent.method}`);

        // Wait for navigation and Surfingkeys to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify we navigated to the root
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).toBe(`${ORIGIN}/`);
        console.log(`URL after gU: ${urlAfter}`);
    });

    test('gU removes path, query params, and hash - navigates to clean origin', async () => {
        // Navigate to URL with path, query params, and hash (404 page, but navigation works)
        const complexUrl = `${ORIGIN}/some/path/page.html?foo=bar&baz=qux#section`;
        await executeInTarget(pageWs, `window.location.href = '${complexUrl}'`);

        // Wait for navigation and Surfingkeys
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify URL has all components
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toContain('/some/path/page.html');
        expect(urlBefore).toContain('?foo=bar&baz=qux');
        expect(urlBefore).toContain('#section');
        console.log(`URL before gU (with path, query, hash): ${urlBefore}`);

        // Set up listener for navigation
        const navPromise = waitForPageNavigation(pageWs, 10000);

        // Press 'gU'
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'U');

        // Wait for navigation
        await navPromise;
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify URL is now just the origin
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).toBe(`${ORIGIN}/`);
        expect(urlAfter).not.toContain('?');
        expect(urlAfter).not.toContain('#');
        expect(urlAfter).not.toContain('/some/path');
        console.log(`URL after gU (clean origin): ${urlAfter}`);
    });

    test('gU on URL already at root causes navigation to same URL', async () => {
        // Navigate to root URL
        await executeInTarget(pageWs, `window.location.href = '${ORIGIN}/'`);

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify we're at root
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toBe(`${ORIGIN}/`);
        console.log(`URL before gU (already at root): ${urlBefore}`);

        // Press 'gU' - this will navigate to same URL (location.origin)
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'U');

        // Wait a moment for command to execute
        await new Promise(resolve => setTimeout(resolve, 800));

        // Verify URL is still the root (unchanged)
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).toBe(`${ORIGIN}/`);
        console.log(`URL after gU (still at root): ${urlAfter}`);
    });

    test('gU works from URL with only query parameters', async () => {
        // Navigate to root with query params
        const urlWithQuery = `${ORIGIN}/?search=test&page=1`;
        await executeInTarget(pageWs, `window.location.href = '${urlWithQuery}'`);

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify URL has query params
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toContain('?search=test&page=1');
        console.log(`URL before gU (query params): ${urlBefore}`);

        // Set up listener for navigation
        const navPromise = waitForPageNavigation(pageWs, 10000);

        // Press 'gU'
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'U');

        // Wait for navigation
        await navPromise;
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify query params removed
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).toBe(`${ORIGIN}/`);
        expect(urlAfter).not.toContain('?');
        console.log(`URL after gU (query params removed): ${urlAfter}`);
    });

    test('gU works from URL with only hash fragment', async () => {
        // Navigate to root with hash
        const urlWithHash = `${ORIGIN}/#section-heading`;
        await executeInTarget(pageWs, `window.location.href = '${urlWithHash}'`);

        // Wait for navigation (hash change is fast)
        await new Promise(resolve => setTimeout(resolve, 500));
        await waitForSurfingkeysReady(pageWs);

        // Verify URL has hash
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toContain('#section-heading');
        console.log(`URL before gU (hash only): ${urlBefore}`);

        // Set up listener for navigation
        const navPromise = waitForPageNavigation(pageWs, 10000);

        // Press 'gU'
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'U');

        // Wait for navigation
        await navPromise;
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify hash removed
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).toBe(`${ORIGIN}/`);
        expect(urlAfter).not.toContain('#');
        console.log(`URL after gU (hash removed): ${urlAfter}`);
    });

    test('gU navigates to origin even from deeply nested paths', async () => {
        // Navigate to very deep path (404 page)
        const veryDeepPath = `${ORIGIN}/a/b/c/d/e/f/g/h/i/j/page.html`;
        await executeInTarget(pageWs, `window.location.href = '${veryDeepPath}'`);

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify we're at the deep path
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toBe(veryDeepPath);
        console.log(`URL before gU (very deep path): ${urlBefore}`);

        // Set up listener for navigation
        const navPromise = waitForPageNavigation(pageWs, 10000);

        // Press 'gU'
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'U');

        // Wait for navigation
        await navPromise;
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify we're at root
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).toBe(`${ORIGIN}/`);
        console.log(`URL after gU (back to root from deep path): ${urlAfter}`);
    });

    test('gU navigates to origin preserving protocol and port', async () => {
        // Start from a path (404 page)
        const pathUrl = `${ORIGIN}/test/path.html`;
        await executeInTarget(pageWs, `window.location.href = '${pathUrl}'`);

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Get origin to verify protocol and port are correct
        const origin = await getCurrentOrigin(pageWs);
        expect(origin).toBe(ORIGIN);
        console.log(`Origin: ${origin}`);

        // Verify URL before
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toBe(pathUrl);

        // Set up listener for navigation
        const navPromise = waitForPageNavigation(pageWs, 10000);

        // Press 'gU'
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'U');

        // Wait for navigation
        await navPromise;
        await new Promise(resolve => setTimeout(resolve, 1000));
        await waitForSurfingkeysReady(pageWs);

        // Verify URL is origin (with correct protocol and port)
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).toBe(`${ORIGIN}/`);
        expect(urlAfter).toContain('http://');
        expect(urlAfter).toContain(':9873');
        console.log(`URL after gU (protocol and port preserved): ${urlAfter}`);
    });
});
