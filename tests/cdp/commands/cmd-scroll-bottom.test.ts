/**
 * CDP Test: cmd_scroll_bottom
 *
 * Focused observability test for the scroll to bottom command.
 * - Single command: cmd_scroll_bottom
 * - Single key: 'G'
 * - Single behavior: scroll to absolute bottom position
 * - Focus: verify command execution and scroll behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-bottom.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-bottom.test.ts
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

describe('cmd_scroll_bottom', () => {
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
        // Reset scroll position to TOP before each test
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

    test('pressing G scrolls to bottom', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(0);

        await sendKey(pageWs, 'G');

        const finalScroll = await waitForScrollChange(pageWs, initialScroll, {
            direction: 'down',
            minDelta: 100
        });

        // Calculate maximum scroll position
        const maxScroll = await executeInTarget(
            pageWs,
            'document.documentElement.scrollHeight - window.innerHeight'
        );

        expect(finalScroll).toBeGreaterThan(initialScroll);
        expect(Math.abs(finalScroll - maxScroll)).toBeLessThan(5);
        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px (maxScroll: ${maxScroll}px, delta: ${Math.abs(finalScroll - maxScroll)}px)`);
    });

    test('G moves to exactly bottom position', async () => {
        const start = await getScrollPosition(pageWs);
        expect(start).toBe(0);

        // Calculate maximum scroll position
        const maxScroll = await executeInTarget(
            pageWs,
            'document.documentElement.scrollHeight - window.innerHeight'
        );

        await sendKey(pageWs, 'G');

        const finalScroll = await waitForScrollChange(pageWs, start, {
            direction: 'down',
            minDelta: 100
        });

        console.log(`Final scroll: ${finalScroll}px, Max scroll: ${maxScroll}px, Difference: ${Math.abs(finalScroll - maxScroll)}px`);

        // Verify final scroll position equals calculated max scroll (within 5px tolerance)
        expect(Math.abs(finalScroll - maxScroll)).toBeLessThan(5);
    });
});
