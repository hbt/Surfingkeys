/**
 * CDP Test: cmd_nav_remove_hash
 *
 * Focused observability test for the remove hash fragment command.
 * - Single command: cmd_nav_remove_hash
 * - Single key: 'g#'
 * - Single behavior: remove hash fragment from URL
 * - Focus: verify command execution and URL change using CDP events
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-nav-remove-hash.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-nav-remove-hash.test.ts
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
 * Wait for navigation to complete using CDP Page.frameNavigated or Page.navigatedWithinDocument
 * Returns when the page URL changes (either full navigation or hash-only navigation)
 */
async function waitForNavigation(ws: WebSocket, timeoutMs: number = 10000): Promise<any> {
    // Enable Page domain to receive navigation events
    ws.send(JSON.stringify({
        id: Math.floor(Math.random() * 100000),
        method: 'Page.enable'
    }));

    // Wait for either Page.navigatedWithinDocument (hash change) or Page.frameNavigated (full navigation)
    // Hash removal triggers navigatedWithinDocument since it's a same-page navigation
    return await waitForCDPEvent(
        ws,
        (msg) => {
            return msg.method === 'Page.navigatedWithinDocument' ||
                   msg.method === 'Page.frameNavigated';
        },
        timeoutMs
    );
}

/**
 * Get current page URL
 */
async function getCurrentURL(ws: WebSocket): Promise<string> {
    return await executeInTarget(ws, 'window.location.href');
}

describe('cmd_nav_remove_hash', () => {
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

        // Create fixture tab with hash
        tabId = await createTab(bgWs, FIXTURE_URL + '#section1', true);

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

    test('pressing g# removes hash fragment from URL', async () => {
        // Navigate to URL with hash
        await executeInTarget(pageWs, `window.location.href = '${FIXTURE_URL}#test-hash'`);

        // Wait a moment for navigation to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify URL has hash
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toContain('#test-hash');
        console.log(`URL before: ${urlBefore}`);

        // Set up listener for navigation event BEFORE pressing 'g#'
        const navPromise = waitForNavigation(pageWs, 10000);

        // Press 'g' followed by '#' to trigger cmd_nav_remove_hash
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '#');

        // Wait for navigation to complete
        const navEvent = await navPromise;
        console.log(`Navigation event detected: ${navEvent.method}`);

        // Wait for Surfingkeys to be ready after navigation
        await waitForSurfingkeysReady(pageWs);

        // Verify hash was removed
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).not.toContain('#');
        expect(urlAfter).toBe(FIXTURE_URL);
        console.log(`URL after: ${urlAfter}`);
    });

    test('pressing g# on URL without hash leaves URL unchanged', async () => {
        // Navigate to URL without hash
        await executeInTarget(pageWs, `window.location.href = '${FIXTURE_URL}'`);

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify URL has no hash
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).not.toContain('#');
        console.log(`URL before (no hash): ${urlBefore}`);

        // Press 'g#' - this should not cause navigation (URL stays the same)
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '#');

        // Wait a moment for command to execute
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify URL is unchanged
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).toBe(urlBefore);
        expect(urlAfter).toBe(FIXTURE_URL);
        console.log(`URL after (still no hash): ${urlAfter}`);
    });

    test('g# removes only the hash fragment, preserving query parameters', async () => {
        // Navigate to URL with both query params and hash
        const urlWithQueryAndHash = `${FIXTURE_URL}?page=1&sort=desc#section2`;
        await executeInTarget(pageWs, `window.location.href = '${urlWithQueryAndHash}'`);

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify URL has both query and hash
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toContain('?page=1&sort=desc');
        expect(urlBefore).toContain('#section2');
        console.log(`URL before: ${urlBefore}`);

        // Set up listener for navigation
        const navPromise = waitForNavigation(pageWs, 10000);

        // Press 'g#'
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '#');

        // Wait for navigation
        await navPromise;
        await waitForSurfingkeysReady(pageWs);

        // Verify hash removed but query params preserved
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).toContain('?page=1&sort=desc');
        expect(urlAfter).not.toContain('#');
        expect(urlAfter).toBe(`${FIXTURE_URL}?page=1&sort=desc`);
        console.log(`URL after: ${urlAfter}`);
    });

    test('g# removes hash with complex fragment containing special characters', async () => {
        // Navigate to URL with complex hash (e.g., anchor links with special chars)
        const complexHash = '#section-title:with-special_chars!';
        await executeInTarget(pageWs, `window.location.href = '${FIXTURE_URL}${complexHash}'`);

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify URL has complex hash
        const urlBefore = await getCurrentURL(pageWs);
        expect(urlBefore).toContain(complexHash);
        console.log(`URL before (complex hash): ${urlBefore}`);

        // Set up listener for navigation
        const navPromise = waitForNavigation(pageWs, 10000);

        // Press 'g#'
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '#');

        // Wait for navigation
        await navPromise;
        await waitForSurfingkeysReady(pageWs);

        // Verify hash removed
        const urlAfter = await getCurrentURL(pageWs);
        expect(urlAfter).not.toContain('#');
        expect(urlAfter).toBe(FIXTURE_URL);
        console.log(`URL after (complex hash removed): ${urlAfter}`);
    });

    test('repeated g# presses on URL with hash works consistently', async () => {
        // Navigate to URL with hash
        await executeInTarget(pageWs, `window.location.href = '${FIXTURE_URL}#first-hash'`);
        await new Promise(resolve => setTimeout(resolve, 300));

        // First removal
        const urlBefore1 = await getCurrentURL(pageWs);
        expect(urlBefore1).toContain('#first-hash');
        console.log(`URL before first g#: ${urlBefore1}`);

        const navPromise1 = waitForNavigation(pageWs, 10000);
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '#');
        await navPromise1;
        await waitForSurfingkeysReady(pageWs);

        const urlAfter1 = await getCurrentURL(pageWs);
        expect(urlAfter1).toBe(FIXTURE_URL);
        console.log(`URL after first g#: ${urlAfter1}`);

        // Add hash again
        await executeInTarget(pageWs, `window.location.href = '${FIXTURE_URL}#second-hash'`);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Second removal
        const urlBefore2 = await getCurrentURL(pageWs);
        expect(urlBefore2).toContain('#second-hash');
        console.log(`URL before second g#: ${urlBefore2}`);

        const navPromise2 = waitForNavigation(pageWs, 10000);
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, '#');
        await navPromise2;
        await waitForSurfingkeysReady(pageWs);

        const urlAfter2 = await getCurrentURL(pageWs);
        expect(urlAfter2).toBe(FIXTURE_URL);
        console.log(`URL after second g#: ${urlAfter2}`);
    });
});
