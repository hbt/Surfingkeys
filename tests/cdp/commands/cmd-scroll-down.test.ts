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
    waitForSurfingkeysReady,
    waitForScrollChange
} from '../utils/browser-actions';
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

        await sendKey(pageWs, 'j');

        const finalScroll = await waitForScrollChange(pageWs, initialScroll, {
            direction: 'down',
            minDelta: 20
        });

        expect(finalScroll).toBeGreaterThan(initialScroll);
        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px (delta: ${finalScroll - initialScroll}px)`);
    });

    test('scroll down distance is consistent', async () => {
        const start = await getScrollPosition(pageWs);
        expect(start).toBe(0);

        await sendKey(pageWs, 'j');
        const after1 = await waitForScrollChange(pageWs, start, {
            direction: 'down',
            minDelta: 20
        });
        const distance1 = after1 - start;

        await sendKey(pageWs, 'j');
        const after2 = await waitForScrollChange(pageWs, after1, {
            direction: 'down',
            minDelta: 20
        });
        const distance2 = after2 - after1;

        console.log(`1st scroll: ${distance1}px, 2nd scroll: ${distance2}px, delta: ${Math.abs(distance1 - distance2)}px`);

        // Both scrolls should move roughly the same distance (within 15px tolerance)
        expect(Math.abs(distance1 - distance2)).toBeLessThan(15);
    });

    test('pressing 5j scrolls 5 times the distance of j', async () => {
        // First measure single j scroll distance
        const start = await getScrollPosition(pageWs);
        expect(start).toBe(0);

        await sendKey(pageWs, 'j');
        const afterSingle = await waitForScrollChange(pageWs, start, {
            direction: 'down',
            minDelta: 20
        });
        const singleDistance = afterSingle - start;

        // Reset scroll position
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Now test 5j (below typical repeatThreshold of 9)
        const start2 = await getScrollPosition(pageWs);
        expect(start2).toBe(0);

        // Send '5', 'j' to create 5j command
        await sendKey(pageWs, '5', 50);
        await sendKey(pageWs, 'j');

        const afterRepeat = await waitForScrollChange(pageWs, start2, {
            direction: 'down',
            minDelta: singleDistance * 3  // Expect at least 3x
        });
        const repeatDistance = afterRepeat - start2;

        const expectedDistance = singleDistance * 5;
        const ratio = repeatDistance / singleDistance;

        console.log(`Single j: ${singleDistance}px, 5j: ${repeatDistance}px (ratio: ${ratio.toFixed(2)}x, expected: 5x)`);

        // Verify it scrolled approximately 5 times the distance
        // Allow tolerance of ±1.5x (between 3.5x and 6.5x)
        expect(ratio).toBeGreaterThanOrEqual(3.5);
        expect(ratio).toBeLessThanOrEqual(6.5);
    });
});
