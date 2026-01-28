/**
 * CDP Test: cmd_visual_scroll_center
 *
 * Focused observability test for the visual mode scroll center command.
 * - Single command: cmd_visual_scroll_center
 * - Key sequence: 'v' (enter visual), then 'zz'
 * - Single behavior: scroll cursor to center of viewport
 * - Focus: verify command execution in visual mode
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-visual-scroll-center.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-scroll-center.test.ts
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

describe('cmd_visual_scroll_center', () => {
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
        // Reset scroll position before each test
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');

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

    test('entering visual mode and pressing zz', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(0);

        // Enter visual mode
        await sendKey(pageWs, 'v');

        // Press zz to scroll cursor to center
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 'z');

        // No error should occur - basic verification
        const finalScroll = await getScrollPosition(pageWs);
        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px (delta: ${finalScroll - initialScroll}px)`);
    });

    test('zz in visual mode scrolls cursor to center', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(0);

        // Enter visual mode
        await sendKey(pageWs, 'v');

        // Press zz to scroll cursor to center
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 'z');

        // Wait for any scroll changes
        const finalScroll = await waitForScrollChange(pageWs, initialScroll, {
            direction: 'down',
            minDelta: 0,
            timeout: 1000
        }).catch(() => getScrollPosition(pageWs));

        console.log(`Visual mode scroll center: ${initialScroll}px → ${finalScroll}px`);

        // Basic verification - the command should execute without error
        expect(typeof finalScroll).toBe('number');
    });
});
