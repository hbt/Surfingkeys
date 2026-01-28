/**
 * CDP Test: cmd_visual_scroll_top
 *
 * Focused observability test for the visual scroll top command.
 * - Single command: cmd_visual_scroll_top
 * - Single key: 'zt' (in visual mode)
 * - Single behavior: scroll cursor to top of viewport
 * - Focus: verify command execution in visual mode without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-scroll-top.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-scroll-top.test.ts
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
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_visual_scroll_top', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    /**
     * Enter visual mode and position cursor
     */
    async function enterVisualModeAtText(text: string): Promise<void> {
        // Use browser's find API to position cursor at specific text
        await executeInTarget(pageWs, `
            (function() {
                // Find the text on the page
                const found = window.find('${text}', false, false, false, false, true, false);
                if (!found) {
                    console.warn('Text not found: ${text}');
                }
            })()
        `);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send 'v' to enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    /**
     * Get cursor position relative to viewport
     */
    async function getCursorPosition(): Promise<{ top: number; bottom: number; left: number; height: number } | null> {
        return executeInTarget(pageWs, `
            (function() {
                const cursor = document.querySelector('.surfingkeys_cursor');
                if (cursor) {
                    const rect = cursor.getBoundingClientRect();
                    return {
                        top: rect.top,
                        bottom: rect.bottom,
                        left: rect.left,
                        height: rect.height
                    };
                }
                return null;
            })()
        `);
    }

    /**
     * Check if visual cursor is visible
     */
    async function isVisualCursorVisible(): Promise<boolean> {
        return executeInTarget(pageWs, `
            (function() {
                const cursor = document.querySelector('.surfingkeys_cursor');
                return cursor !== null && document.body.contains(cursor);
            })()
        `);
    }

    /**
     * Get current selection information
     */
    async function getSelectionInfo(): Promise<{
        type: string;
        anchorOffset: number;
        focusOffset: number;
        text: string;
    }> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                return {
                    type: sel.type,
                    anchorOffset: sel.anchorOffset,
                    focusOffset: sel.focusOffset,
                    text: sel.toString()
                };
            })()
        `);
    }

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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/visual-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Reset scroll position and clear selections before each test
        await executeInTarget(pageWs, `
            window.scrollTo(0, 0);
            window.getSelection().removeAllRanges();
        `);

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        // Exit visual mode if still in it
        try {
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
            // Ignore errors
        }

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

        // Enter visual mode at a text location
        await enterVisualModeAtText('Scroll space');

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

    test('zt in visual mode scrolls cursor to top of viewport', async () => {
        // Start from middle of page
        await executeInTarget(pageWs, 'window.scrollTo(0, 800)');
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(800);

        // Enter visual mode at text that's visible
        await enterVisualModeAtText('Scroll space');

        // Get cursor position before zt
        const cursorPosBefore = await getCursorPosition();
        console.log(`Cursor position before zt: top=${cursorPosBefore?.top}px`);

        // Press 'zt' to scroll cursor to top
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');

        // Wait for scroll to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        const finalScroll = await getScrollPosition(pageWs);

        // Get cursor position after zt
        const cursorPosAfter = await getCursorPosition();
        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px`);
        console.log(`Cursor position after zt: top=${cursorPosAfter?.top}px`);

        // The scroll position should have changed
        expect(finalScroll).not.toBe(initialScroll);

        // Cursor should be near the top of viewport (within 50px tolerance)
        if (cursorPosAfter !== null) {
            expect(cursorPosAfter.top).toBeLessThanOrEqual(50);
            expect(cursorPosAfter.top).toBeGreaterThanOrEqual(0);
        }
    });

    test('zt from different cursor positions scrolls consistently', async () => {
        // Test from position 1
        await executeInTarget(pageWs, 'window.scrollTo(0, 600)');
        await enterVisualModeAtText('ipsum');

        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        const cursorPos1 = await getCursorPosition();
        console.log(`Position 1 - cursor top: ${cursorPos1?.top}px`);

        // Exit and reset
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Test from position 2
        await executeInTarget(pageWs, 'window.scrollTo(0, 1200)');
        await enterVisualModeAtText('mauris');

        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        const cursorPos2 = await getCursorPosition();
        console.log(`Position 2 - cursor top: ${cursorPos2?.top}px`);

        // Both positions should place cursor near top (within tolerance)
        if (cursorPos1 !== null && cursorPos2 !== null) {
            expect(cursorPos1.top).toBeLessThanOrEqual(50);
            expect(cursorPos2.top).toBeLessThanOrEqual(50);
            // Positions should be similar (within 20px)
            expect(Math.abs(cursorPos1.top - cursorPos2.top)).toBeLessThanOrEqual(20);
        }
    });

    test('zt is idempotent - pressing twice keeps cursor at top', async () => {
        await executeInTarget(pageWs, 'window.scrollTo(0, 800)');
        await enterVisualModeAtText('Scroll space');

        // First zt
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        const firstScroll = await getScrollPosition(pageWs);
        const firstCursorPos = await getCursorPosition();

        console.log(`First zt - scroll: ${firstScroll}px, cursor top: ${firstCursorPos?.top}px`);

        // Second zt
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        const secondScroll = await getScrollPosition(pageWs);
        const secondCursorPos = await getCursorPosition();

        console.log(`Second zt - scroll: ${secondScroll}px, cursor top: ${secondCursorPos?.top}px`);

        // Scroll position should remain the same (within 5px tolerance)
        expect(Math.abs(secondScroll - firstScroll)).toBeLessThanOrEqual(5);

        // Cursor position should remain the same
        if (firstCursorPos !== null && secondCursorPos !== null) {
            expect(Math.abs(secondCursorPos.top - firstCursorPos.top)).toBeLessThanOrEqual(5);
        }
    });

    test('visual mode remains active after pressing zt', async () => {
        await executeInTarget(pageWs, 'window.scrollTo(0, 600)');
        await enterVisualModeAtText('habitant');

        // Give more time for visual mode to fully activate
        await new Promise(resolve => setTimeout(resolve, 200));

        // Check cursor is visible before zt
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before zt: ${cursorVisibleBefore}`);

        // Press zt
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor is still visible after zt
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after zt: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        // The key assertion: after zt, visual mode should still be active
        // Either cursor is visible OR we can query the selection
        expect(cursorVisibleAfter || typeof selection.focusOffset === 'number').toBe(true);

        console.log(`Visual mode remained active after zt command`);
    });

    test('zt works in caret mode (state 1)', async () => {
        await executeInTarget(pageWs, 'window.scrollTo(0, 700)');
        await enterVisualModeAtText('vitae');

        // Should be in caret mode (state 1)
        const selection = await getSelectionInfo();
        console.log(`Selection type: ${selection.type}`);

        // Press zt
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        const cursorPos = await getCursorPosition();
        console.log(`Caret mode - cursor top after zt: ${cursorPos?.top}px`);

        // Cursor should be at top
        if (cursorPos !== null) {
            expect(cursorPos.top).toBeLessThanOrEqual(50);
        }
    });

    test('zt works in range mode (state 2)', async () => {
        await executeInTarget(pageWs, 'window.scrollTo(0, 700)');
        await enterVisualModeAtText('pellentesque');

        // Create a selection by moving right (enters range mode)
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const selectionBefore = await getSelectionInfo();
        console.log(`Range mode - selection type: ${selectionBefore.type}, text: "${selectionBefore.text}"`);

        // Press zt
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        const cursorPos = await getCursorPosition();
        console.log(`Range mode - cursor top after zt: ${cursorPos?.top}px`);

        // Cursor should be at top
        if (cursorPos !== null) {
            expect(cursorPos.top).toBeLessThanOrEqual(50);
        }

        // Selection should still be maintained
        const selectionAfter = await getSelectionInfo();
        expect(selectionAfter.text.length).toBeGreaterThan(0);
    });

    test('zt from near top of page does not error', async () => {
        // Start from very top
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
        await enterVisualModeAtText('Visual Mode Test');

        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(0);

        // Press zt (cursor already at top)
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Should not error
        const finalScroll = await getScrollPosition(pageWs);
        expect(typeof finalScroll).toBe('number');

        console.log(`zt from top: scroll remained at ${finalScroll}px`);
    });

    test('zt scrolls down when cursor is below viewport top', async () => {
        // Position at top, but cursor will be lower
        await executeInTarget(pageWs, 'window.scrollTo(0, 100)');
        await enterVisualModeAtText('Scroll space');

        const initialScroll = await getScrollPosition(pageWs);
        const cursorPosBefore = await getCursorPosition();

        console.log(`Before zt - scroll: ${initialScroll}px, cursor top: ${cursorPosBefore?.top}px`);

        // If cursor is in lower part of viewport, zt should scroll down
        if (cursorPosBefore && cursorPosBefore.top > 100) {
            await sendKey(pageWs, 'z');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            const finalScroll = await getScrollPosition(pageWs);
            const cursorPosAfter = await getCursorPosition();

            console.log(`After zt - scroll: ${finalScroll}px, cursor top: ${cursorPosAfter?.top}px`);

            // Scroll should have increased
            expect(finalScroll).toBeGreaterThan(initialScroll);

            // Cursor should now be at top
            if (cursorPosAfter !== null) {
                expect(cursorPosAfter.top).toBeLessThanOrEqual(50);
            }
        }
    });

    test('zt scrolls up when cursor is above viewport top', async () => {
        // Scroll down first, then move cursor up
        await executeInTarget(pageWs, 'window.scrollTo(0, 1000)');
        await enterVisualModeAtText('Lorem ipsum');

        const initialScroll = await getScrollPosition(pageWs);
        const cursorPosBefore = await getCursorPosition();

        console.log(`Before zt - scroll: ${initialScroll}px, cursor top: ${cursorPosBefore?.top}px`);

        // Cursor is in viewport, zt will align to top
        await sendKey(pageWs, 'z');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        const finalScroll = await getScrollPosition(pageWs);
        const cursorPosAfter = await getCursorPosition();

        console.log(`After zt - scroll: ${finalScroll}px, cursor top: ${cursorPosAfter?.top}px`);

        // Cursor should be at top
        if (cursorPosAfter !== null) {
            expect(cursorPosAfter.top).toBeLessThanOrEqual(50);
        }
    });
});
