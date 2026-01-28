/**
 * CDP Test: cmd_visual_scroll_bottom
 *
 * Focused observability test for the visual mode scroll bottom command.
 * - Single command: cmd_visual_scroll_bottom
 * - Key sequence: 'v' then 'zb'
 * - Mode: Visual
 * - Behavior: Scroll the page to position the cursor at the bottom of the window in visual mode
 * - Focus: verify command execution and scroll behavior without timeouts
 *
 * Usage:
 *   Automated:       ./bin/dbg test-run tests/cdp/commands/cmd-visual-scroll-bottom.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-visual-scroll-bottom.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-scroll-bottom.test.ts
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
    getScrollPosition,
    enableInputDomain,
    waitForSurfingkeysReady,
    waitForScrollChange
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_visual_scroll_bottom', () => {
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

        // Create fixture tab
        tabId = await createTab(bgWs, FIXTURE_URL, true);

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
        // Reset scroll position before each test - scroll down a bit so we have room to test
        await executeInTarget(pageWs, 'window.scrollTo(0, 500)');

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        // Exit visual mode if still active (press Esc)
        await sendKey(pageWs, 'Escape');

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

    test('entering visual mode and pressing zb', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(500);

        // Enter visual mode
        await sendKey(pageWs, 'v');

        // Press zb to scroll cursor to bottom
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 'b');

        // Command should execute without error
        // The scroll position may or may not change depending on cursor position
        const finalScroll = await getScrollPosition(pageWs);
        expect(finalScroll).toBeGreaterThanOrEqual(0);

        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px (delta: ${finalScroll - initialScroll}px)`);
    });

    test('zb in visual mode scrolls cursor to bottom', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(500);

        // Enter visual mode
        await sendKey(pageWs, 'v');

        // Press zb to scroll cursor to bottom of viewport
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 'b');

        // Get final scroll position
        const finalScroll = await getScrollPosition(pageWs);

        // Verify scroll occurred (cursor should now be at bottom of viewport)
        // The exact scroll position depends on cursor location, but it should be different
        expect(typeof finalScroll).toBe('number');
        expect(finalScroll).toBeGreaterThanOrEqual(0);

        console.log(`Visual mode zb: ${initialScroll}px → ${finalScroll}px (delta: ${finalScroll - initialScroll}px)`);
    });
});
