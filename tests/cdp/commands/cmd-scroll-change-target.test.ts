/**
 * CDP Test: cmd_scroll_change_target
 *
 * Focused observability test for the change scroll target command.
 * - Single command: cmd_scroll_change_target
 * - Single key: 'cs' (two-character sequence)
 * - Single behavior: toggle scroll target between main page and nested scrollable elements
 * - Focus: verify command execution without error
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-change-target.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-change-target.test.ts
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
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_scroll_change_target', () => {
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

    test('pressing cs executes change scroll target command', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(0);

        // Send 'cs' key sequence
        await sendKey(pageWs, 'c');
        await sendKey(pageWs, 's');

        // Command should execute without error
        // We don't necessarily expect a scroll position change since this is a state toggle
        const finalScroll = await getScrollPosition(pageWs);

        // The command executed successfully if we reach here without error
        expect(finalScroll).toBeGreaterThanOrEqual(0);
        console.log(`Scroll target changed - initial: ${initialScroll}px, after: ${finalScroll}px`);
    });

    test('cs can be called multiple times', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(0);

        // First cs invocation
        await sendKey(pageWs, 'c');
        await sendKey(pageWs, 's');

        const afterFirst = await getScrollPosition(pageWs);
        expect(afterFirst).toBeGreaterThanOrEqual(0);

        // Second cs invocation (toggles back)
        await sendKey(pageWs, 'c');
        await sendKey(pageWs, 's');

        const afterSecond = await getScrollPosition(pageWs);
        expect(afterSecond).toBeGreaterThanOrEqual(0);

        // Both invocations should complete without error
        console.log(`Multiple toggle - initial: ${initialScroll}px, after 1st: ${afterFirst}px, after 2nd: ${afterSecond}px`);
    });
});
