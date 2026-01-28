/**
 * CDP Test: cmd_scroll_leftmost
 *
 * Focused observability test for the scroll leftmost command.
 * - Single command: cmd_scroll_leftmost
 * - Single key: '0'
 * - Single behavior: scroll to leftmost position (absolute horizontal position)
 * - Focus: verify command execution and horizontal scroll to leftmost edge
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-leftmost.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-leftmost.test.ts
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
    waitFor
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Get horizontal scroll position
 */
async function getScrollX(ws: WebSocket): Promise<number> {
    return executeInTarget(ws, 'window.scrollX');
}

/**
 * Wait until horizontal scroll position changes by at least minDelta in the specified direction.
 * Returns the new scroll position once the condition is met.
 */
async function waitForHorizontalScrollChange(
    ws: WebSocket,
    baseline: number,
    options: {
        direction: 'left' | 'right';
        minDelta?: number;
        timeoutMs?: number;
        intervalMs?: number;
    }
): Promise<number> {
    const timeout = options.timeoutMs ?? 4000;
    const interval = options.intervalMs ?? 100;
    const minDelta = options.minDelta ?? 1;

    await waitFor(async () => {
        const current = await getScrollX(ws);
        if (options.direction === 'right') {
            return current - baseline >= minDelta;
        }
        return baseline - current >= minDelta;
    }, timeout, interval);

    return getScrollX(ws);
}

describe('cmd_scroll_leftmost', () => {
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
        // Set initial scroll to right side for leftmost scroll test
        // Scroll to far right so we can test scrolling to leftmost
        await executeInTarget(pageWs, 'window.scrollTo(10000, 0)');

        // Wait a moment for scroll to settle
        await new Promise(resolve => setTimeout(resolve, 200));

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

    test('pressing 0 scrolls to leftmost', async () => {
        const initialScroll = await getScrollX(pageWs);
        expect(initialScroll).toBeGreaterThan(0); // Should be scrolled to the right initially

        await sendKey(pageWs, '0');

        const finalScroll = await waitForHorizontalScrollChange(pageWs, initialScroll, {
            direction: 'left',
            minDelta: 10
        });

        expect(finalScroll).toBe(0);
        console.log(`Horizontal scroll: ${initialScroll}px → ${finalScroll}px (scrolled to leftmost)`);
    });

    test('0 moves to exactly leftmost position', async () => {
        // Get initial scroll position (should be far right from beforeEach)
        const start = await getScrollX(pageWs);
        expect(start).toBeGreaterThan(0);

        // Press 0 to scroll to leftmost
        await sendKey(pageWs, '0');

        const finalScroll = await waitForHorizontalScrollChange(pageWs, start, {
            direction: 'left',
            minDelta: 10
        });

        // Verify we're exactly at leftmost (scrollX = 0)
        expect(finalScroll).toBe(0);
        console.log(`Leftmost scroll: ${start}px → ${finalScroll}px (exactly at left edge)`);
    });
});
