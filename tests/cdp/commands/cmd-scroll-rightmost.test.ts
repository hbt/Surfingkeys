/**
 * CDP Test: cmd_scroll_rightmost
 *
 * Focused observability test for the scroll rightmost command.
 * - Single command: cmd_scroll_rightmost
 * - Single key: '$'
 * - Single behavior: scroll to rightmost (absolute horizontal position)
 * - Focus: verify command execution and absolute rightmost positioning
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-rightmost.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-rightmost.test.ts
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
    getScrollPositionX,
    enableInputDomain,
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { sendKeyAndWaitForScroll, scrollToTopAndWait } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_scroll_rightmost', () => {
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
        // Set initial scroll to left side for rightmost test (robust wait)
        await scrollToTopAndWait(pageWs);

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

    test('pressing $ scrolls to rightmost', async () => {
        const initialScroll = await getScrollPositionX(pageWs);
        expect(initialScroll).toBe(0); // Should be scrolled to the left initially

        // Use atomic pattern: listener attached BEFORE key sent
        const result = await sendKeyAndWaitForScroll(pageWs, '$', {
            direction: 'right',
            minDelta: 100,
            timeoutMs: 5000
        });

        // Calculate max horizontal scroll
        const maxScrollX = await executeInTarget(pageWs,
            'document.documentElement.scrollWidth - window.innerWidth'
        );

        expect(result.final).toBeGreaterThan(result.baseline);
        // Verify we're at the rightmost position (within 10px tolerance)
        expect(Math.abs(result.final - maxScrollX)).toBeLessThan(10);
        console.log(`Horizontal scroll: ${result.baseline}px → ${result.final}px (max: ${maxScrollX}px)`);
    });

    test('$ moves to exactly rightmost position', async () => {
        // Start from left
        const start = await getScrollPositionX(pageWs);
        expect(start).toBe(0);

        // Calculate max horizontal scroll before scrolling
        const maxScrollX = await executeInTarget(pageWs,
            'document.documentElement.scrollWidth - window.innerWidth'
        );

        // Use atomic pattern: listener attached BEFORE key sent
        const result = await sendKeyAndWaitForScroll(pageWs, '$', {
            direction: 'right',
            minDelta: 100,
            timeoutMs: 5000
        });

        // Verify final position equals max scroll (within 10px tolerance)
        expect(Math.abs(result.final - maxScrollX)).toBeLessThan(10);
        console.log(`Rightmost positioning: ${result.final}px / ${maxScrollX}px (delta: ${Math.abs(result.final - maxScrollX)}px)`);
    });
});
