/**
 * CDP Test: cmd_nav_remove_query
 *
 * Focused observability test for the remove query string command.
 * - Single command: cmd_nav_remove_query
 * - Single key: 'g?'
 * - Single behavior: remove query string from URL and navigate to clean URL
 * - Focus: verify command execution and URL changes using CDP events
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-nav-remove-query.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-nav-remove-query.test.ts
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
 * Wait for page navigation to complete using CDP Page.lifecycleEvent
 * Returns when the page reaches 'load' or 'networkIdle' state
 */
async function waitForPageLoad(ws: WebSocket, timeoutMs: number = 10000): Promise<void> {
    // Enable Page domain to receive lifecycle events
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
 * Get the current page URL
 */
async function getCurrentUrl(ws: WebSocket): Promise<string> {
    const url = await executeInTarget(ws, 'window.location.href');
    return url;
}

describe('cmd_nav_remove_query', () => {
    const FIXTURE_BASE_URL = 'http://127.0.0.1:9873/scroll-test.html';

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

    beforeEach(async () => {
        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';
    });

    afterEach(async () => {
        // Capture coverage snapshot after test and calculate delta
        if (pageWs && beforeCovData) {
            await captureAfterCoverage(pageWs, currentTestName, beforeCovData);
        }
    });

    test('pressing g? removes query string from URL', async () => {
        // Create tab with query string
        const urlWithQuery = `${FIXTURE_BASE_URL}?foo=bar&baz=qux`;
        tabId = await createTab(bgWs, urlWithQuery, true);

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

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);

        // Verify we're on the URL with query string
        const urlBefore = await getCurrentUrl(pageWs);
        expect(urlBefore).toBe(urlWithQuery);
        console.log(`URL before: ${urlBefore}`);

        // Set up listener for page load event BEFORE pressing 'g?'
        const loadPromise = waitForPageLoad(pageWs, 10000);

        // Press 'g' followed by '?' to trigger cmd_nav_remove_query
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '?');

        // Wait for page load to complete
        await loadPromise;
        console.log('Page load event detected');

        // Wait for Surfingkeys to re-inject after navigation
        await waitForSurfingkeysReady(pageWs);

        // Verify the query string was removed
        const urlAfter = await getCurrentUrl(pageWs);
        expect(urlAfter).toBe(FIXTURE_BASE_URL);
        console.log(`URL after: ${urlAfter}`);

        // Verify query string is gone
        expect(urlAfter).not.toContain('?');
        expect(urlAfter).not.toContain('foo=bar');
    });

    test('URL without query string remains unchanged', async () => {
        // Create tab without query string
        const urlWithoutQuery = FIXTURE_BASE_URL;
        tabId = await createTab(bgWs, urlWithoutQuery, true);

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

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);

        // Verify we're on the URL without query string
        const urlBefore = await getCurrentUrl(pageWs);
        expect(urlBefore).toBe(urlWithoutQuery);
        console.log(`URL before: ${urlBefore}`);

        // Set up listener for page load event
        const loadPromise = waitForPageLoad(pageWs, 10000);

        // Press 'g' followed by '?' to trigger cmd_nav_remove_query
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '?');

        // Wait for page load to complete
        await loadPromise;
        console.log('Page load event detected');

        // Wait for Surfingkeys to re-inject after navigation
        await waitForSurfingkeysReady(pageWs);

        // Verify URL is still the same (no query to remove)
        const urlAfter = await getCurrentUrl(pageWs);
        expect(urlAfter).toBe(urlWithoutQuery);
        console.log(`URL after: ${urlAfter} (unchanged)`);
    });

    test('URL with query and hash removes both (implementation behavior)', async () => {
        // Create tab with both query string and hash
        // NOTE: The regex /\?[^\?]*$/ removes everything from ? to end of string,
        // including the hash. This is the actual implementation behavior.
        const urlWithQueryAndHash = `${FIXTURE_BASE_URL}?foo=bar#section1`;
        const expectedUrlAfter = FIXTURE_BASE_URL;  // Both query and hash removed

        tabId = await createTab(bgWs, urlWithQueryAndHash, true);

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

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);

        // Verify we're on the URL with query and hash
        const urlBefore = await getCurrentUrl(pageWs);
        expect(urlBefore).toBe(urlWithQueryAndHash);
        console.log(`URL before: ${urlBefore}`);

        // Set up listener for page load event BEFORE pressing 'g?'
        const loadPromise = waitForPageLoad(pageWs, 10000);

        // Press 'g' followed by '?' to trigger cmd_nav_remove_query
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '?');

        // Wait for page load to complete
        await loadPromise;
        console.log('Page load event detected');

        // Wait for Surfingkeys to re-inject after navigation
        await waitForSurfingkeysReady(pageWs);

        // Verify both query and hash were removed (actual regex behavior)
        const urlAfter = await getCurrentUrl(pageWs);
        expect(urlAfter).toBe(expectedUrlAfter);
        console.log(`URL after: ${urlAfter}`);

        // Verify both query and hash are gone
        expect(urlAfter).not.toContain('?');
        expect(urlAfter).not.toContain('foo=bar');
        expect(urlAfter).not.toContain('#section1');
    });

    test('URL with only hash (no query) remains unchanged', async () => {
        // Create tab with hash but no query string
        const urlWithHash = `${FIXTURE_BASE_URL}#section2`;

        tabId = await createTab(bgWs, urlWithHash, true);

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

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);

        // Verify we're on the URL with hash
        const urlBefore = await getCurrentUrl(pageWs);
        expect(urlBefore).toBe(urlWithHash);
        console.log(`URL before: ${urlBefore}`);

        // Press 'g' followed by '?' to trigger cmd_nav_remove_query
        // Since there's no query string, the replace() returns the same URL
        // Setting location.href to the same value does NOT trigger navigation
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '?');

        // Wait a short time for command to execute (no navigation occurs)
        // This is acceptable because we're verifying a negative case (no change)
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify URL with hash remains unchanged (no query to remove)
        const urlAfter = await getCurrentUrl(pageWs);
        expect(urlAfter).toBe(urlWithHash);
        console.log(`URL after: ${urlAfter} (unchanged)`);

        // Verify hash is still there
        expect(urlAfter).toContain('#section2');
        expect(urlAfter).not.toContain('?');
    });

    test('multiple query parameters are all removed', async () => {
        // Create tab with multiple query parameters
        const urlWithMultipleParams = `${FIXTURE_BASE_URL}?param1=value1&param2=value2&param3=value3`;

        tabId = await createTab(bgWs, urlWithMultipleParams, true);

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

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);

        // Verify we're on the URL with multiple query parameters
        const urlBefore = await getCurrentUrl(pageWs);
        expect(urlBefore).toBe(urlWithMultipleParams);
        console.log(`URL before: ${urlBefore}`);

        // Set up listener for page load event BEFORE pressing 'g?'
        const loadPromise = waitForPageLoad(pageWs, 10000);

        // Press 'g' followed by '?' to trigger cmd_nav_remove_query
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '?');

        // Wait for page load to complete
        await loadPromise;
        console.log('Page load event detected');

        // Wait for Surfingkeys to re-inject after navigation
        await waitForSurfingkeysReady(pageWs);

        // Verify all query parameters were removed
        const urlAfter = await getCurrentUrl(pageWs);
        expect(urlAfter).toBe(FIXTURE_BASE_URL);
        console.log(`URL after: ${urlAfter}`);

        // Verify no query parameters remain
        expect(urlAfter).not.toContain('?');
        expect(urlAfter).not.toContain('param1');
        expect(urlAfter).not.toContain('param2');
        expect(urlAfter).not.toContain('param3');
    });
});
