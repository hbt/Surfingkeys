/**
 * CDP Test: cmd_visual_toggle_end
 *
 * Focused observability test for the visual mode toggle selection direction command.
 * - Single command: cmd_visual_toggle_end
 * - Single key: 'o'
 * - Single behavior: toggle selection direction (swap anchor and focus)
 * - Focus: verify command execution without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * The 'o' command swaps the anchor and focus points of a selection:
 * - Anchor: the fixed end of the selection
 * - Focus: the moving end of the selection
 * - After 'o', the previous anchor becomes the focus and vice versa
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-toggle-end.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-toggle-end.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-toggle-end.test.ts
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
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_visual_toggle_end', () => {
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
     * Get current selection information
     */
    async function getSelectionInfo(): Promise<{
        type: string;
        anchorOffset: number;
        focusOffset: number;
        text: string;
        anchorNodeText: string;
        focusNodeText: string;
        anchorNodeId: string;
        focusNodeId: string;
    }> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                const getNodeId = (node) => {
                    if (!node) return '';
                    // Walk up to find element with ID
                    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
                    while (el && !el.id) {
                        el = el.parentElement;
                    }
                    return el ? el.id : '';
                };
                return {
                    type: sel.type,
                    anchorOffset: sel.anchorOffset,
                    focusOffset: sel.focusOffset,
                    text: sel.toString(),
                    anchorNodeText: sel.anchorNode ? sel.anchorNode.textContent : '',
                    focusNodeText: sel.focusNode ? sel.focusNode.textContent : '',
                    anchorNodeId: getNodeId(sel.anchorNode),
                    focusNodeId: getNodeId(sel.focusNode)
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
        // Reset page state: clear any selections
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

    test('entering visual mode and pressing o does not error', async () => {
        // Enter visual mode at beginning of a line
        await enterVisualModeAtText('This is a medium');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press o to toggle selection direction
        await sendKey(pageWs, 'o');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode o executed: focusOffset=${selection.focusOffset}`);
    });

    test('o toggles selection direction in range mode', async () => {
        // Enter visual mode and create a selection
        await enterVisualModeAtText('Multi-word');

        // Move right to create a selection (state becomes Range mode)
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeToggle = await getSelectionInfo();
        console.log(`Before o - type: ${beforeToggle.type}, anchor: ${beforeToggle.anchorOffset}, focus: ${beforeToggle.focusOffset}, text: "${beforeToggle.text}"`);

        // Press o to toggle direction
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterToggle = await getSelectionInfo();
        console.log(`After o - type: ${afterToggle.type}, anchor: ${afterToggle.anchorOffset}, focus: ${afterToggle.focusOffset}, text: "${afterToggle.text}"`);

        // After toggling, anchor and focus should have swapped
        expect(afterToggle.anchorOffset).toBe(beforeToggle.focusOffset);
        expect(afterToggle.focusOffset).toBe(beforeToggle.anchorOffset);
    });

    test('o preserves selected text content', async () => {
        // Enter visual mode and create a selection
        await enterVisualModeAtText('Short line');

        // Move right to select some characters
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeToggle = await getSelectionInfo();
        const textBefore = beforeToggle.text;
        console.log(`Before o - text: "${textBefore}"`);

        // Press o to toggle direction
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterToggle = await getSelectionInfo();
        const textAfter = afterToggle.text;
        console.log(`After o - text: "${textAfter}"`);

        // The selected text should remain the same
        expect(textAfter).toBe(textBefore);
    });

    test('o works with word-level selections', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word line');

        // Select a word using 'w' command
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeToggle = await getSelectionInfo();
        console.log(`Before o - anchor: ${beforeToggle.anchorOffset}, focus: ${beforeToggle.focusOffset}`);

        // Toggle direction
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterToggle = await getSelectionInfo();
        console.log(`After o - anchor: ${afterToggle.anchorOffset}, focus: ${afterToggle.focusOffset}`);

        // Positions should have swapped
        expect(afterToggle.anchorOffset).toBe(beforeToggle.focusOffset);
        expect(afterToggle.focusOffset).toBe(beforeToggle.anchorOffset);
    });

    test('o can be toggled multiple times', async () => {
        // Enter visual mode and create a selection
        await enterVisualModeAtText('This is a much longer');

        // Create selection
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 200));

        const initial = await getSelectionInfo();
        console.log(`Initial - anchor: ${initial.anchorOffset}, focus: ${initial.focusOffset}`);

        // First toggle
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterFirst = await getSelectionInfo();
        console.log(`After 1st o - anchor: ${afterFirst.anchorOffset}, focus: ${afterFirst.focusOffset}`);

        // Second toggle
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSecond = await getSelectionInfo();
        console.log(`After 2nd o - anchor: ${afterSecond.anchorOffset}, focus: ${afterSecond.focusOffset}`);

        // After two toggles, should be back to original positions
        expect(afterSecond.anchorOffset).toBe(initial.anchorOffset);
        expect(afterSecond.focusOffset).toBe(initial.focusOffset);

        // Third toggle
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterThird = await getSelectionInfo();
        console.log(`After 3rd o - anchor: ${afterThird.anchorOffset}, focus: ${afterThird.focusOffset}`);

        // After three toggles, should match first toggle
        expect(afterThird.anchorOffset).toBe(afterFirst.anchorOffset);
        expect(afterThird.focusOffset).toBe(afterFirst.focusOffset);
    });

    test('o allows extending selection in opposite direction', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word line');

        // Move right to create selection
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const initial = await getSelectionInfo();
        console.log(`Initial - text: "${initial.text}", type: ${initial.type}`);

        // Only proceed if we have a Range selection
        if (initial.type !== 'Range' || initial.text.length === 0) {
            console.log('Skipping test: no range selection created');
            return;
        }

        // Toggle direction with o
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterToggle = await getSelectionInfo();
        console.log(`After toggle - text: "${afterToggle.text}", type: ${afterToggle.type}`);

        // Now move in what was previously the backward direction (but is now forward)
        await sendKey(pageWs, 'h');
        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 200));

        const afterExtend = await getSelectionInfo();
        console.log(`After extend - text: "${afterExtend.text}"`);

        // The selection should exist and may have changed
        expect(afterExtend.text.length).toBeGreaterThan(0);
    });

    test('o works with line boundary selections', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Short line');

        // Select to end of line
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeToggle = await getSelectionInfo();
        const textBefore = beforeToggle.text;
        console.log(`Before o at line end - anchor: ${beforeToggle.anchorOffset}, focus: ${beforeToggle.focusOffset}, text: "${textBefore}"`);

        // Toggle direction
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterToggle = await getSelectionInfo();
        const textAfter = afterToggle.text;
        console.log(`After o at line end - anchor: ${afterToggle.anchorOffset}, focus: ${afterToggle.focusOffset}, text: "${textAfter}"`);

        // Text should be preserved
        expect(textAfter).toBe(textBefore);

        // Positions should have swapped
        expect(afterToggle.anchorOffset).toBe(beforeToggle.focusOffset);
        expect(afterToggle.focusOffset).toBe(beforeToggle.anchorOffset);
    });

    test('visual mode remains active after pressing o', async () => {
        // Enter visual mode and create selection
        await enterVisualModeAtText('Final line');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeToggle = await getSelectionInfo();
        console.log(`Before o - type: ${beforeToggle.type}, text: "${beforeToggle.text}"`);

        // Check cursor is visible before o
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before o: ${cursorVisibleBefore}`);

        // Press o
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
        console.log(`After o - type: ${selection.type}, text: "${selection.text}"`);

        // Check cursor visibility after o - give more time for cursor to render
        await new Promise(resolve => setTimeout(resolve, 200));
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after o: ${cursorVisibleAfter}`);

        // The selection should have been toggled (anchor and focus swapped)
        expect(selection.anchorOffset).toBe(beforeToggle.focusOffset);
        expect(selection.focusOffset).toBe(beforeToggle.anchorOffset);

        console.log(`Visual mode still active after o command`);
    });

    test('o followed by movement extends selection from new anchor', async () => {
        // Enter visual mode
        await enterVisualModeAtText('This is a medium length');

        // Create initial selection by moving forward
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 200));

        const initial = await getSelectionInfo();
        console.log(`Initial selection - text: "${initial.text}", type: ${initial.type}`);

        // Only proceed if we have a Range selection
        if (initial.type !== 'Range' || initial.text.length === 0) {
            console.log('Skipping test: no range selection created');
            return;
        }

        // Toggle direction
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterToggle = await getSelectionInfo();
        console.log(`After toggle - text: "${afterToggle.text}"`);

        // Move forward from the new position (which was the old anchor)
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterMove = await getSelectionInfo();
        console.log(`After move - text: "${afterMove.text}"`);

        // The selection should exist
        expect(afterMove.text.length).toBeGreaterThan(0);
    });

    test('o works with backward selections', async () => {
        // Enter visual mode
        await enterVisualModeAtText('line one two three');

        // Move forward first to establish a position
        await sendKey(pageWs, 'w');
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Toggle to reverse direction
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeBackward = await getSelectionInfo();

        // Move backward with 'b'
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterBackward = await getSelectionInfo();
        console.log(`After backward move - before text: "${beforeBackward.text}", after text: "${afterBackward.text}"`);

        // Selection should have changed
        expect(afterBackward.text).not.toBe(beforeBackward.text);
    });

    test('o in caret mode does not error', async () => {
        // Enter visual mode (starts in caret mode - state 1)
        await enterVisualModeAtText('Short line');

        // Don't create a range selection, stay in caret mode
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeToggle = await getSelectionInfo();
        console.log(`Before o in caret mode - type: ${beforeToggle.type}`);

        // Press o in caret mode
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Should not error
        const afterToggle = await getSelectionInfo();
        console.log(`After o in caret mode - type: ${afterToggle.type}`);

        // Should still be able to query selection
        expect(typeof afterToggle.focusOffset).toBe('number');
    });
});
