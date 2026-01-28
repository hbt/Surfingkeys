/**
 * CDP Test: cmd_scroll_top
 *
 * Focused observability test for the scroll to top command.
 * - Single command: cmd_scroll_top
 * - Single key: 'gg' (two 'g' key presses)
 * - Single behavior: scroll to top
 * - Focus: verify command execution and scroll behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-top.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-top.test.ts
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

describe('cmd_scroll_top', () => {
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
        // Reset scroll position to BOTTOM before each test
        await executeInTarget(pageWs, 'window.scrollTo(0, document.documentElement.scrollHeight)');

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

    test('pressing gg scrolls to top', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBeGreaterThan(0); // Verify we're at the bottom

        // Send 'gg' command (two 'g' key presses)
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');

        const finalScroll = await waitForScrollChange(pageWs, initialScroll, {
            direction: 'up',
            minDelta: 100
        });

        expect(finalScroll).toBeLessThanOrEqual(5); // At top (or within 5px)
        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px (delta: ${initialScroll - finalScroll}px)`);
    });

    test('gg moves to exactly top position', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBeGreaterThan(0); // Verify we're at the bottom

        // Send 'gg' command (two 'g' key presses)
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');

        const finalScroll = await waitForScrollChange(pageWs, initialScroll, {
            direction: 'up',
            minDelta: 100
        });

        // Should be at exactly 0 or within 5px tolerance
        expect(finalScroll).toBeLessThanOrEqual(5);
        console.log(`Final scroll position: ${finalScroll}px (expected: 0px)`);
    });
});
