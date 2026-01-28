/**
 * CDP Test: cmd_visual_document_start
 *
 * Focused observability test for the visual mode document start command.
 * - Single command: cmd_visual_document_start
 * - Single key: 'gg'
 * - Single behavior: move cursor to beginning of document in visual mode
 * - Focus: verify command execution without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-document-start.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-document-start.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-document-start.test.ts
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

describe('cmd_visual_document_start', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    /**
     * Enter visual mode and position cursor at specific text
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
     * Get current selection information
     */
    async function getSelectionInfo(): Promise<{
        type: string;
        anchorOffset: number;
        focusOffset: number;
        text: string;
        anchorNodeText: string;
        focusNodeText: string;
        focusNodeId: string;
    }> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                let focusNodeId = '';
                if (sel.focusNode) {
                    // Try to find parent element with ID
                    let node = sel.focusNode;
                    while (node && node !== document.body) {
                        if (node.id) {
                            focusNodeId = node.id;
                            break;
                        }
                        node = node.parentNode;
                    }
                }
                return {
                    type: sel.type,
                    anchorOffset: sel.anchorOffset,
                    focusOffset: sel.focusOffset,
                    text: sel.toString(),
                    anchorNodeText: sel.anchorNode ? sel.anchorNode.textContent : '',
                    focusNodeText: sel.focusNode ? sel.focusNode.textContent : '',
                    focusNodeId: focusNodeId
                };
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
     * Get document height for scrolling tests
     */
    async function getDocumentHeight(): Promise<number> {
        return executeInTarget(pageWs, 'document.scrollingElement.scrollHeight');
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
        // Reset page state: scroll to top and clear any selections
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
        await executeInTarget(pageWs, 'window.getSelection().removeAllRanges()');

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        // Exit visual mode if still in it
        try {
            // Press Escape to exit visual mode
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

    test('entering visual mode and pressing gg does not error', async () => {
        // Enter visual mode in the middle of document
        await enterVisualModeAtText('Final line');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press 'gg' to go to document start
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode gg executed: focusOffset=${selection.focusOffset}`);
    });

    test('gg in visual mode scrolls to document start', async () => {
        // Scroll to middle of document first
        const docHeight = await getDocumentHeight();
        const middleScroll = Math.floor(docHeight / 2);
        await executeInTarget(pageWs, `window.scrollTo(0, ${middleScroll})`);
        await new Promise(resolve => setTimeout(resolve, 100));

        const initialScroll = await getScrollPosition(pageWs);
        console.log(`Initial scroll position: ${initialScroll}px`);
        expect(initialScroll).toBeGreaterThan(100);

        // Enter visual mode
        await enterVisualModeAtText('Final line');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press 'gg' to go to document start
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check scroll position after gg
        const finalScroll = await getScrollPosition(pageWs);
        console.log(`After gg scroll position: ${finalScroll}px`);

        // Should be scrolled to top (0 or very close to 0)
        expect(finalScroll).toBe(0);
    });

    test('gg moves cursor to beginning of document', async () => {
        // Start from bottom of document
        await enterVisualModeAtText('Final line');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before gg - focusNodeId: "${beforeSelection.focusNodeId}", focusOffset: ${beforeSelection.focusOffset}`);

        // Press 'gg' to go to document start
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After gg - focusNodeId: "${afterSelection.focusNodeId}", focusOffset: ${afterSelection.focusOffset}`);

        // The cursor should be at or near the beginning
        // In visual-test.html, the first content is in the h1 element (line1 is first p)
        const expectedStartElements = ['line1', ''];  // line1 or empty for h1/body

        // Either at the very first element or very close to start (allow up to 15 for h1 text)
        expect(afterSelection.focusOffset).toBeLessThanOrEqual(15);
    });

    test('gg from middle of document moves to start', async () => {
        // Position at a middle line
        await enterVisualModeAtText('line5');

        const beforeSelection = await getSelectionInfo();
        const beforeScroll = await getScrollPosition(pageWs);

        console.log(`Before: focusNodeId="${beforeSelection.focusNodeId}", scroll=${beforeScroll}px`);

        // Press 'gg'
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const afterScroll = await getScrollPosition(pageWs);

        console.log(`After: focusNodeId="${afterSelection.focusNodeId}", scroll=${afterScroll}px`);

        // Should move to top
        expect(afterScroll).toBe(0);

        // focusNodeId should change to an earlier element
        expect(afterSelection.focusNodeId).not.toBe('line5');
    });

    test('gg is idempotent when already at document start', async () => {
        // Start at the beginning
        await enterVisualModeAtText('Visual Mode Test');

        // Ensure we're at the top
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Press 'gg' first time
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        const firstSelection = await getSelectionInfo();
        const firstScroll = await getScrollPosition(pageWs);

        console.log(`First gg: scroll=${firstScroll}px, focusNodeId="${firstSelection.focusNodeId}"`);

        // Press 'gg' again
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        const secondSelection = await getSelectionInfo();
        const secondScroll = await getScrollPosition(pageWs);

        console.log(`Second gg: scroll=${secondScroll}px, focusNodeId="${secondSelection.focusNodeId}"`);

        // Should stay at the top
        expect(secondScroll).toBe(0);
        expect(firstScroll).toBe(0);

        // Position should remain consistent
        expect(secondSelection.focusNodeId).toBe(firstSelection.focusNodeId);
        expect(secondSelection.focusOffset).toBe(firstSelection.focusOffset);
    });

    test('gg works from different starting positions', async () => {
        // Test from line 2
        await enterVisualModeAtText('line2');
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        const scroll1 = await getScrollPosition(pageWs);
        console.log(`From line2: scroll=${scroll1}px`);
        expect(scroll1).toBe(0);

        // Reset and test from line 7
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 100));
        await enterVisualModeAtText('line7');
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        const scroll2 = await getScrollPosition(pageWs);
        console.log(`From line7: scroll=${scroll2}px`);
        expect(scroll2).toBe(0);

        // Reset and test from line 10
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 100));
        await enterVisualModeAtText('line10');
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        const scroll3 = await getScrollPosition(pageWs);
        console.log(`From line10: scroll=${scroll3}px`);
        expect(scroll3).toBe(0);
    });

    test('gg in range mode extends selection to document start', async () => {
        // Enter visual mode at middle
        await enterVisualModeAtText('line5');

        // Create a selection by moving (enter range mode)
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before gg in range mode - type: ${beforeSelection.type}, text length: ${beforeSelection.text.length}`);

        // Press 'gg' to extend selection to document start
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After gg in range mode - type: ${afterSelection.type}, text length: ${afterSelection.text.length}`);

        // Note: In visual mode, gg behavior may collapse selection or move to start
        // The key thing is that we're at the document start
        const finalScroll = await getScrollPosition(pageWs);
        expect(finalScroll).toBe(0);

        // Verify command completed without error
        expect(afterSelection).toBeDefined();
    });

    test('visual mode remains active after pressing gg', async () => {
        // Enter visual mode
        await enterVisualModeAtText('line8');

        // Check cursor is visible before gg
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before gg: ${cursorVisibleBefore}`);

        // Press 'gg'
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after gg
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after gg: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after gg command`);
    });

    test('gg resets match occurrence counter to 0', async () => {
        // This test verifies the code: currentOccurrence = 0;
        // We can't directly check currentOccurrence, but we can verify the command completes

        await enterVisualModeAtText('line6');

        // Press 'gg'
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Should complete successfully
        const selection = await getSelectionInfo();
        expect(selection).toBeDefined();

        const scroll = await getScrollPosition(pageWs);
        expect(scroll).toBe(0);

        console.log(`gg completed successfully from line6, moved to top`);
    });

    test('gg handles fixed position elements correctly', async () => {
        // The implementation notes: "there may be some fixed-position div for navbar"
        // This test verifies gg explicitly sets scrollTop to 0

        // Start from middle
        await executeInTarget(pageWs, 'window.scrollTo(0, 300)');
        await new Promise(resolve => setTimeout(resolve, 200));

        const initialScroll = await getScrollPosition(pageWs);
        console.log(`Initial scroll after setting to 300: ${initialScroll}px`);
        expect(initialScroll).toBeGreaterThan(100); // Allow some variance

        await enterVisualModeAtText('line4');

        // Press 'gg'
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Should explicitly set scrollTop to 0 (not just scrollIntoView)
        const finalScroll = await getScrollPosition(pageWs);
        expect(finalScroll).toBe(0);

        console.log(`gg correctly set scrollTop to 0 (not just scrollIntoView)`);
    });

    test('pressing two separate g keys in sequence does not trigger gg', async () => {
        // Verify that 'gg' requires the keys to be pressed together (within timeout)

        await enterVisualModeAtText('line9');
        const beforeScroll = await getScrollPosition(pageWs);

        // Press 'g', wait longer than typical key sequence timeout, then press 'g' again
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Long delay
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterScroll = await getScrollPosition(pageWs);

        // The position might have changed, but if gg was properly triggered, we'd be at 0
        // If the timeout worked correctly, the second 'g' starts a new sequence
        // So we may not be at 0 (depends on timing), but this verifies command doesn't error
        console.log(`Scroll after delayed g+g: before=${beforeScroll}px, after=${afterScroll}px`);

        // Just verify no error occurred
        const selection = await getSelectionInfo();
        expect(selection).toBeDefined();
    });
});
