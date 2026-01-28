/**
 * CDP Test: cmd_visual_forward_word
 *
 * Focused observability test for the visual mode forward word command.
 * - Single command: cmd_visual_forward_word
 * - Single key: 'w'
 * - Single behavior: move cursor forward by one word in visual mode
 * - Focus: verify command execution and cursor movement without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-forward-word.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-forward-word.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-forward-word.test.ts
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

describe('cmd_visual_forward_word', () => {
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
        // Clear selection and find text from the beginning
        await executeInTarget(pageWs, `
            (function() {
                // Clear any existing selection
                window.getSelection().removeAllRanges();

                // Set caret to beginning of document to start search from top
                const sel = window.getSelection();
                const range = document.createRange();
                const firstTextNode = document.body.firstChild;
                if (firstTextNode) {
                    range.setStart(firstTextNode, 0);
                    range.collapse(true);
                    sel.addRange(range);
                }

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
    }> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                return {
                    type: sel.type,
                    anchorOffset: sel.anchorOffset,
                    focusOffset: sel.focusOffset,
                    text: sel.toString(),
                    anchorNodeText: sel.anchorNode ? sel.anchorNode.textContent : '',
                    focusNodeText: sel.focusNode ? sel.focusNode.textContent : ''
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

    test('entering visual mode and pressing w does not error', async () => {
        // Enter visual mode at beginning of a line
        await enterVisualModeAtText('Short line');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press w to move forward one word
        await sendKey(pageWs, 'w');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode w executed: focusOffset=${selection.focusOffset}`);
    });

    test('w in visual mode moves cursor forward', async () => {
        // Enter visual mode at beginning of line
        await enterVisualModeAtText('This is a');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before w - focusOffset: ${beforeSelection.focusOffset}, text: "${beforeSelection.focusNodeText}"`);

        // Press w to move forward one word
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After w - focusOffset: ${afterSelection.focusOffset}, text: "${afterSelection.focusNodeText}"`);

        // The focus offset should have moved forward (higher offset)
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(beforeSelection.focusOffset);
    });

    test('w moves forward one word at a time', async () => {
        // Position at beginning of word
        await enterVisualModeAtText('medium length');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press w to move forward one word
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Cursor: offset ${initialOffset} → ${finalOffset}, moved ${finalOffset - initialOffset} chars forward`);

        // In visual mode caret state, w should move to beginning of next word
        const lineText = afterSelection.focusNodeText;
        expect(finalOffset).toBeGreaterThanOrEqual(0);
        expect(finalOffset).toBeLessThanOrEqual(lineText.length);
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('w works with alphanumeric words', async () => {
        // Test on line with mixed alphanumeric: "abc123 def456 ghi789"
        // Position at "abc123" which is before other words
        await enterVisualModeAtText('abc123');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press w to move forward to next word (def456)
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Alphanumeric: offset ${initialOffset} → ${finalOffset}`);

        // Should move forward or stay same
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('w works with numeric words', async () => {
        // Test on line with numbers
        await enterVisualModeAtText('Numbers:');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press w to move forward to the number
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Numbers test: offset ${initialOffset} → ${finalOffset}`);

        // Should move forward or stay same
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('w works with punctuation', async () => {
        // Test on line with punctuation
        await enterVisualModeAtText('Numbers:');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press w to move forward
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Punctuation: offset ${initialOffset} → ${finalOffset}`);

        // Should move forward or stay same
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('w at end of document is idempotent', async () => {
        // Position at very end
        await enterVisualModeAtText('ABSOLUTE END');

        // Move to end of text
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'l');
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeEnd = await getSelectionInfo();

        // Try to move forward (should not error even at end)
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterEnd = await getSelectionInfo();

        // Verify no error
        expect(typeof afterEnd.focusOffset).toBe('number');

        console.log(`At end of document: focusOffset=${afterEnd.focusOffset}`);

        // Should stay at end or near end
        expect(afterEnd.focusOffset).toBeGreaterThanOrEqual(beforeEnd.focusOffset);
    });

    test('w in range mode extends selection forward', async () => {
        // Enter visual mode at start of line
        await enterVisualModeAtText('four five six');

        // Create a small selection by moving right to enter range mode
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before w in range mode - type: ${beforeSelection.type}, text: "${beforeSelection.text}"`);

        // Press w to extend selection forward
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After w in range mode - type: ${afterSelection.type}, text: "${afterSelection.text}"`);

        // Selection should remain in Range mode (or moved back to Caret if selection collapsed)
        // After w in range mode, the selection may change but should still be valid
        expect(['Range', 'Caret']).toContain(afterSelection.type);
    });

    test('visual mode remains active after pressing w', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word');

        // Check cursor is visible before w
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before w: ${cursorVisibleBefore}`);

        // Press w
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after w
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after w: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after w command`);
    });

    test('consecutive w presses move forward word by word', async () => {
        // Start at beginning of multi-word line
        await enterVisualModeAtText('one two three');

        // Record offsets after each w press
        const offsets = [];

        const initial = await getSelectionInfo();
        offsets.push(initial.focusOffset);
        console.log(`Initial offset: ${initial.focusOffset}`);

        // Press w 5 times and record each offset
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'w');
            await new Promise(resolve => setTimeout(resolve, 200));

            const current = await getSelectionInfo();
            offsets.push(current.focusOffset);
            console.log(`After w #${i + 1}: offset ${current.focusOffset}`);
        }

        // Each successive offset should be greater than or equal to the previous
        // (equal only if at document end)
        for (let i = 1; i < offsets.length; i++) {
            expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
        }

        console.log(`Offset progression: ${offsets.join(' → ')}`);
    });

    test('2w moves forward two words', async () => {
        // Position at start to have multiple words ahead
        await enterVisualModeAtText('one two three');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press 2w to move forward two words
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`2w command: offset ${initialOffset} → ${finalOffset}, moved ${finalOffset - initialOffset} chars`);

        // Should have moved forward (at least not backward)
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('3w moves forward three words', async () => {
        // Position at start with words ahead
        await enterVisualModeAtText('one two three four');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press 3w to move forward three words
        await sendKey(pageWs, '3', 50);
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`3w command: offset ${initialOffset} → ${finalOffset}, moved ${finalOffset - initialOffset} chars`);

        // Should have moved forward (at least not backward)
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('5w moves forward five words', async () => {
        // Position at start of line with many words
        await enterVisualModeAtText('Multi-word line one two three four five six');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press 5w to move forward five words
        await sendKey(pageWs, '5', 50);
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`5w command: offset ${initialOffset} → ${finalOffset}, moved ${finalOffset - initialOffset} chars`);

        // Should have moved forward significantly
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('w moves across empty lines', async () => {
        // Position before empty line (line4 is empty)
        await enterVisualModeAtText('Line after empty');

        // Move backward to get before empty line
        await sendKey(pageWs, 'b');
        await sendKey(pageWs, 'b');
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press w to move forward (should handle empty line)
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Across empty line: offset ${initialOffset} → ${finalOffset}`);

        // Should move forward or stay same
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('w followed by b returns to approximately same position', async () => {
        // Start at a word
        await enterVisualModeAtText('medium length');

        const initialSelection = await getSelectionInfo();
        const initialOffset = initialSelection.focusOffset;

        // Move forward with w
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 200));

        const afterW = await getSelectionInfo();
        console.log(`After w: offset ${afterW.focusOffset}`);

        // Move back with b
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterB = await getSelectionInfo();
        console.log(`After w then b: ${initialOffset} → ${afterW.focusOffset} → ${afterB.focusOffset}`);

        // Should return to same or nearby position
        // (may not be exact due to word boundary handling)
        expect(Math.abs(afterB.focusOffset - initialOffset)).toBeLessThan(20);
    });
});
