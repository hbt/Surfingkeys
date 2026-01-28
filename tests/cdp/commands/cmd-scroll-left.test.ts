/**
 * CDP Test: cmd_scroll_left
 *
 * Focused observability test for the scroll left command.
 * - Single command: cmd_scroll_left
 * - Single key: 'h'
 * - Single behavior: scroll left
 * - Focus: verify command execution and horizontal scroll behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-left.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-left.test.ts
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

describe('cmd_scroll_left', () => {
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
        // Set initial scroll to right side for left scroll test
        // Scroll to far right so we can test scrolling left
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

    test('pressing h key scrolls page left', async () => {
        const initialScroll = await getScrollX(pageWs);
        expect(initialScroll).toBeGreaterThan(0); // Should be scrolled to the right initially

        await sendKey(pageWs, 'h');

        const finalScroll = await waitForHorizontalScrollChange(pageWs, initialScroll, {
            direction: 'left',
            minDelta: 20
        });

        expect(finalScroll).toBeLessThan(initialScroll);
        console.log(`Horizontal scroll: ${initialScroll}px → ${finalScroll}px (delta: ${initialScroll - finalScroll}px)`);
    });

    test('multiple scroll left operations work', async () => {
        // Get initial scroll position (should be far right from beforeEach)
        const start = await getScrollX(pageWs);
        expect(start).toBeGreaterThan(0);

        // First scroll left
        await sendKey(pageWs, 'h');
        const after1 = await waitForHorizontalScrollChange(pageWs, start, {
            direction: 'left',
            minDelta: 10
        });
        expect(after1).toBeLessThan(start);

        // If we're not at 0, try another scroll
        if (after1 > 0) {
            await sendKey(pageWs, 'h');
            const after2 = await waitForHorizontalScrollChange(pageWs, after1, {
                direction: 'left',
                minDelta: 5,
                timeoutMs: 2000
            });
            expect(after2).toBeLessThanOrEqual(after1);
            console.log(`Multiple scrolls: ${start}px → ${after1}px → ${after2}px`);
        } else {
            console.log(`Single scroll: ${start}px → ${after1}px (reached left edge)`);
        }
    });
});
