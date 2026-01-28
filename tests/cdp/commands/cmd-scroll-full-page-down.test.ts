/**
 * CDP Test: cmd_scroll_full_page_down
 *
 * Focused observability test for the scroll full page down command.
 * - Single command: cmd_scroll_full_page_down
 * - Single key: 'P'
 * - Single behavior: scroll down by one full page
 * - Focus: verify command execution and scroll behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-full-page-down.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-full-page-down.test.ts
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
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { waitForScrollCompleteViaEvent } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_scroll_full_page_down', () => {
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

    test('pressing P key scrolls page down by full page', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(0);

        await sendKey(pageWs, 'P');

        // Event-driven: wait for scroll event instead of polling
        const finalScroll = await waitForScrollCompleteViaEvent(pageWs, 'down', {
            direction: 'down',
            minDelta: 300,
            timeoutMs: 5000
        });

        expect(finalScroll).toBeGreaterThan(initialScroll);
        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px (delta: ${finalScroll - initialScroll}px)`);
    });

    test('full page down scroll distance is consistent', async () => {
        const start = await getScrollPosition(pageWs);
        expect(start).toBe(0);

        // Capture baseline BEFORE sending scroll command
        const baseline1 = await getScrollPosition(pageWs);
        await sendKey(pageWs, 'P');
        // Event-driven: wait for scroll event instead of polling, with captured baseline
        const after1 = await waitForScrollCompleteViaEvent(pageWs, 'down', {
            direction: 'down',
            minDelta: 300,
            timeoutMs: 5000,
            baseline: baseline1
        });
        const distance1 = after1 - baseline1;

        // Capture baseline BEFORE sending second scroll command
        const baseline2 = await getScrollPosition(pageWs);
        await sendKey(pageWs, 'P');
        // Event-driven: wait for scroll event instead of polling, with captured baseline
        const after2 = await waitForScrollCompleteViaEvent(pageWs, 'down', {
            direction: 'down',
            minDelta: 300,
            timeoutMs: 5000,
            baseline: baseline2
        });
        const distance2 = after2 - baseline2;

        console.log(`1st scroll: ${distance1}px, 2nd scroll: ${distance2}px, delta: ${Math.abs(distance1 - distance2)}px`);

        // Both scrolls should move roughly the same distance (within 15px tolerance)
        expect(Math.abs(distance1 - distance2)).toBeLessThan(15);
    });
});
