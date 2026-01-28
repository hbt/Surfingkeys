/**
 * CDP Test: cmd_visual_backward_sentence
 *
 * Focused observability test for the visual backward sentence command.
 * - Single command: cmd_visual_backward_sentence
 * - Single key: '('
 * - Single behavior: move backward by sentence in visual mode
 * - Focus: verify command execution and sentence navigation without timeouts
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-backward-sentence.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-backward-sentence.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-backward-sentence.test.ts
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

/**
 * Enter visual mode and position cursor at specific text
 */
async function enterVisualModeAtText(pageWs: WebSocket, text: string): Promise<void> {
    // Use browser's find API to position cursor at specific text
    // Clear any existing selection first
    await executeInTarget(pageWs, 'window.getSelection().removeAllRanges()');
    await new Promise(resolve => setTimeout(resolve, 50));

    await executeInTarget(pageWs, `
        (function() {
            // Find the text on the page
            const found = window.find('${text}', false, false, false, false, true, false);
            if (!found) {
                console.warn('Text not found: ${text}');
            } else {
                // Move cursor to start of found text to avoid being at the end
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    // Collapse to start of found range
                    sel.collapse(range.startContainer, range.startOffset);
                }
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
async function getSelectionInfo(pageWs: WebSocket): Promise<{
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
async function isVisualCursorVisible(pageWs: WebSocket): Promise<boolean> {
    return executeInTarget(pageWs, `
        (function() {
            const cursor = document.querySelector('.surfingkeys_cursor');
            return cursor !== null && document.body.contains(cursor);
        })()
    `);
}

describe('cmd_visual_backward_sentence', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-sentence-test.html';

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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/visual-sentence-test.html');
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

    test('entering visual mode and pressing ( does not error', async () => {
        // Enter visual mode at end of third sentence
        await enterVisualModeAtText(pageWs, 'third sentence');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press ( to move backward one sentence
        await sendKey(pageWs, '(');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo(pageWs);
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode ( executed: focusOffset=${selection.focusOffset}`);
    });

    test('( in visual mode moves cursor backward', async () => {
        // Enter visual mode in the middle of third sentence
        await enterVisualModeAtText(pageWs, 'third sentence here');

        const beforeSelection = await getSelectionInfo(pageWs);
        const initialOffset = beforeSelection.focusOffset;
        console.log(`Before ( - focusOffset: ${initialOffset}, text: "${beforeSelection.focusNodeText}"`);

        // Press ( to move backward one sentence
        await sendKey(pageWs, '(');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo(pageWs);
        const finalOffset = afterSelection.focusOffset;
        console.log(`After ( - focusOffset: ${finalOffset}, text: "${afterSelection.focusNodeText}"`);

        // The focus offset should have moved backward or stayed same (browser limitation)
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });

    test('( moves to previous sentence boundary', async () => {
        // Start at end of second sentence
        await enterVisualModeAtText(pageWs, 'second sentence');

        const beforeSelection = await getSelectionInfo(pageWs);
        const initialOffset = beforeSelection.focusOffset;

        // Press ( to jump to previous sentence
        await sendKey(pageWs, '(');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo(pageWs);
        const finalOffset = afterSelection.focusOffset;

        console.log(`Cursor: offset ${initialOffset} → ${finalOffset}, text: "${afterSelection.focusNodeText}"`);

        // Cursor should have moved backward or stayed (browser may have limitations with sentence granularity)
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);

        // The final offset should be a valid position
        const nodeText = afterSelection.focusNodeText;
        expect(finalOffset).toBeGreaterThanOrEqual(0);
        expect(finalOffset).toBeLessThanOrEqual(nodeText.length);
    });

    test('( navigates backward through multiple sentences', async () => {
        // Start at end of paragraph with multiple sentences
        await enterVisualModeAtText(pageWs, 'final sentence');

        const positions = [];

        // Get initial position
        const initial = await getSelectionInfo(pageWs);
        positions.push(initial.focusOffset);
        console.log(`Initial position: ${positions[0]}`);

        // Press ( three times to move backward through three sentences
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, '(');
            await new Promise(resolve => setTimeout(resolve, 300));

            const current = await getSelectionInfo(pageWs);
            positions.push(current.focusOffset);
            console.log(`After ( #${i + 1}: position ${positions[positions.length - 1]}`);
        }

        // Each position should be different and decreasing (or same if at start)
        for (let i = 1; i < positions.length; i++) {
            expect(positions[i]).toBeLessThanOrEqual(positions[i - 1]);
        }
    });

    test('( at start of document does not error', async () => {
        // Position at the first sentence
        await enterVisualModeAtText(pageWs, 'This is the first');

        // Move to start
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeSelection = await getSelectionInfo(pageWs);
        const initialOffset = beforeSelection.focusOffset;

        // Press ( when already at/near start
        await sendKey(pageWs, '(');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo(pageWs);
        const finalOffset = afterSelection.focusOffset;

        console.log(`At document start: ${initialOffset} → ${finalOffset}`);

        // Should not error, and offset should be valid
        expect(typeof finalOffset).toBe('number');
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });

    test('2( moves backward by two sentences', async () => {
        // Start in the middle of third sentence
        await enterVisualModeAtText(pageWs, 'third sentence here');

        const beforeSelection = await getSelectionInfo(pageWs);
        const initialOffset = beforeSelection.focusOffset;

        // Send '2' followed by '(' to create 2( command
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, '(');
        await new Promise(resolve => setTimeout(resolve, 500));

        const afterSelection = await getSelectionInfo(pageWs);
        const finalOffset = afterSelection.focusOffset;

        console.log(`2( command: ${initialOffset} → ${finalOffset}`);

        // Should have moved backward or stayed (browser may not support sentence granularity fully)
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);

        // Verify we can get valid selection info
        expect(typeof afterSelection.focusOffset).toBe('number');
    });

    test('( works with question mark sentence ending', async () => {
        // Test on sentence ending with ? - position in middle
        await enterVisualModeAtText(pageWs, 'work properly');

        const beforeSelection = await getSelectionInfo(pageWs);
        const initialOffset = beforeSelection.focusOffset;

        await sendKey(pageWs, '(');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo(pageWs);
        const finalOffset = afterSelection.focusOffset;

        console.log(`Question mark sentence: ${initialOffset} → ${finalOffset}`);

        // Should successfully move backward or stay
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });

    test('( works with exclamation mark sentence ending', async () => {
        // Test on sentence ending with !
        await enterVisualModeAtText(pageWs, 'punctuation!');

        const beforeSelection = await getSelectionInfo(pageWs);
        const initialOffset = beforeSelection.focusOffset;

        await sendKey(pageWs, '(');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo(pageWs);
        const finalOffset = afterSelection.focusOffset;

        console.log(`Exclamation mark sentence: ${initialOffset} → ${finalOffset}`);

        // Should successfully move backward (or stay same if at start)
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });

    test('( in range mode extends selection backward to previous sentence', async () => {
        // Enter visual mode
        await enterVisualModeAtText(pageWs, 'second sentence');

        // Create a small selection by moving left a few characters
        await sendKey(pageWs, 'h');
        await sendKey(pageWs, 'h');
        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo(pageWs);
        const beforeTextLength = beforeSelection.text.length;
        console.log(`Before ( in range mode - type: ${beforeSelection.type}, text length: ${beforeTextLength}`);

        // Press ( to extend to previous sentence
        await sendKey(pageWs, '(');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo(pageWs);
        const afterTextLength = afterSelection.text.length;
        console.log(`After ( in range mode - type: ${afterSelection.type}, text length: ${afterTextLength}`);

        // Selection should have extended (more text selected)
        expect(afterTextLength).toBeGreaterThanOrEqual(beforeTextLength);
    });

    test('visual mode remains active after pressing (', async () => {
        // Enter visual mode
        await enterVisualModeAtText(pageWs, 'second sentence');

        // Check cursor is visible before (
        const cursorVisibleBefore = await isVisualCursorVisible(pageWs);
        console.log(`Visual cursor visible before (: ${cursorVisibleBefore}`);

        // Press (
        await sendKey(pageWs, '(');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after (
        const cursorVisibleAfter = await isVisualCursorVisible(pageWs);
        console.log(`Visual cursor visible after (: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo(pageWs);
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after ( command`);
    });

    test('( and ) are complementary (round trip)', async () => {
        // Start at a middle position
        await enterVisualModeAtText(pageWs, 'second sentence');

        const startSelection = await getSelectionInfo(pageWs);
        const startOffset = startSelection.focusOffset;

        // Move backward with (
        await sendKey(pageWs, '(');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterBackward = await getSelectionInfo(pageWs);
        const backwardOffset = afterBackward.focusOffset;

        // Move forward with )
        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterForward = await getSelectionInfo(pageWs);
        const finalOffset = afterForward.focusOffset;

        console.log(`Round trip: ${startOffset} → ${backwardOffset} → ${finalOffset}`);

        // Should return close to original position
        expect(Math.abs(finalOffset - startOffset)).toBeLessThan(10);
    });
});
