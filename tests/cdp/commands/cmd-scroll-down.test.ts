/**
 * CDP Test: cmd_scroll_down
 *
 * Focused observability test for the scroll down command.
 * - Single command: cmd_scroll_down
 * - Single key: 'j'
 * - Single behavior: scroll down
 * - Focus: verify command execution and scroll behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-down.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-down.test.ts
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
import { sendKeyAndWaitForScroll, prepareScrollWait } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_scroll_down', () => {
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

    test('pressing j key scrolls page down', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(0);

        // Use atomic pattern: listener attached BEFORE key sent
        const result = await sendKeyAndWaitForScroll(pageWs, 'j', {
            direction: 'down',
            minDelta: 20
        });

        expect(result.final).toBeGreaterThan(result.baseline);
        console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
    });

    test('scroll down distance is consistent', async () => {
        const start = await getScrollPosition(pageWs);
        expect(start).toBe(0);

        // Use atomic pattern for both scrolls
        const result1 = await sendKeyAndWaitForScroll(pageWs, 'j', {
            direction: 'down',
            minDelta: 20
        });

        const result2 = await sendKeyAndWaitForScroll(pageWs, 'j', {
            direction: 'down',
            minDelta: 20
        });

        console.log(`1st scroll: ${result1.delta}px, 2nd scroll: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);

        // Both scrolls should move roughly the same distance (within 15px tolerance)
        expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(15);
    });

    test('pressing 5j scrolls 5 times the distance of j', async () => {
        // First measure single j scroll distance using atomic pattern
        const result1 = await sendKeyAndWaitForScroll(pageWs, 'j', {
            direction: 'down',
            minDelta: 20
        });
        const singleDistance = result1.delta;

        // Reset scroll position
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Now test 5j (below typical repeatThreshold of 9)
        // Use prepareScrollWait for multi-key sequence
        const { promise, baseline } = await prepareScrollWait(pageWs, {
            direction: 'down',
            minDelta: singleDistance * 3,  // Expect at least 3x
            timeoutMs: 5000
        });

        // Send '5', 'j' to create 5j command
        await sendKey(pageWs, '5', 50);
        await sendKey(pageWs, 'j');

        const afterRepeat = await promise;
        const repeatDistance = afterRepeat - baseline;

        const ratio = repeatDistance / singleDistance;

        console.log(`Single j: ${singleDistance}px, 5j: ${repeatDistance}px (ratio: ${ratio.toFixed(2)}x, expected: 5x)`);

        // Verify it scrolled approximately 5 times the distance
        // Allow tolerance of ±1.5x (between 3.5x and 6.5x)
        expect(ratio).toBeGreaterThanOrEqual(3.5);
        expect(ratio).toBeLessThanOrEqual(6.5);
    });
});
