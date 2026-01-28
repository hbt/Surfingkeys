/**
 * CDP Test: cmd_visual_scroll_top
 *
 * Focused observability test for the visual scroll top command.
 * - Single command: cmd_visual_scroll_top
 * - Single key: 'zt' (in visual mode)
 * - Single behavior: scroll cursor to top of window
 * - Focus: verify command execution in visual mode without errors
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-visual-scroll-top.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-scroll-top.test.ts
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

describe('cmd_visual_scroll_top', () => {
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
        // Exit visual mode if still active
        await executeInTarget(pageWs, `
            if (window.visual && window.visual.visualMode) {
                window.visual.exit();
            }
        `);

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

    test('entering visual mode and pressing zt does not error', async () => {
        // Scroll to middle of page first
        await executeInTarget(pageWs, 'window.scrollTo(0, 500)');
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(500);

        // Enter visual mode with 'v'
        await sendKey(pageWs, 'v');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 100));

        // Press 'zt' to scroll cursor to top
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');

        // Small delay for scroll to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify no error by checking we can still get scroll position
        const finalScroll = await getScrollPosition(pageWs);
        expect(typeof finalScroll).toBe('number');

        console.log(`Visual mode zt executed: ${initialScroll}px → ${finalScroll}px`);
    });

    test('zt in visual mode scrolls cursor to top', async () => {
        // Start from middle of page
        await executeInTarget(pageWs, 'window.scrollTo(0, 800)');
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(800);

        // Enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get cursor position before zt
        const cursorTopBefore = await executeInTarget(pageWs, `
            (() => {
                const cursor = document.querySelector('.cursor');
                if (cursor) {
                    return cursor.getBoundingClientRect().top;
                }
                return null;
            })()
        `);

        console.log(`Cursor top position before zt: ${cursorTopBefore}px`);

        // Press 'zt' to scroll cursor to top
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');

        // Wait for scroll change
        await new Promise(resolve => setTimeout(resolve, 300));

        const finalScroll = await getScrollPosition(pageWs);

        // Get cursor position after zt
        const cursorTopAfter = await executeInTarget(pageWs, `
            (() => {
                const cursor = document.querySelector('.cursor');
                if (cursor) {
                    return cursor.getBoundingClientRect().top;
                }
                return null;
            })()
        `);

        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px`);
        console.log(`Cursor top position after zt: ${cursorTopAfter}px`);

        // The scroll position should have changed
        expect(finalScroll).not.toBe(initialScroll);

        // If cursor exists, it should be near the top of viewport (within reasonable margin)
        if (cursorTopAfter !== null) {
            expect(cursorTopAfter).toBeLessThan(100);
        }
    });
});
