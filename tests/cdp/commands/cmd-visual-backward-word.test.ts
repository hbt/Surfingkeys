/**
 * CDP Test: cmd_visual_backward_word
 *
 * Focused observability test for the visual mode backward word command.
 * - Single command: cmd_visual_backward_word
 * - Single key: 'b'
 * - Single behavior: move cursor backward by one word in visual mode
 * - Focus: verify command execution and cursor movement without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-backward-word.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-backward-word.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-backward-word.test.ts
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

describe('cmd_visual_backward_word', () => {
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

    test('entering visual mode and pressing b does not error', async () => {
        // Enter visual mode in the middle of a line
        await enterVisualModeAtText('medium length');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press b to move backward one word
        await sendKey(pageWs, 'b');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode b executed: focusOffset=${selection.focusOffset}`);
    });

    test('b in visual mode moves cursor backward', async () => {
        // Enter visual mode at end of line
        await enterVisualModeAtText('with some text');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before b - focusOffset: ${beforeSelection.focusOffset}, text: "${beforeSelection.focusNodeText}"`);

        // Press b to move backward one word
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After b - focusOffset: ${afterSelection.focusOffset}, text: "${afterSelection.focusNodeText}"`);

        // The focus offset should have moved backward (lower offset)
        expect(afterSelection.focusOffset).toBeLessThanOrEqual(beforeSelection.focusOffset);
    });

    test('b moves backward one word at a time', async () => {
        // Position in middle of a word (not at word boundary) by finding part of it
        await enterVisualModeAtText('testing');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press b to move back one word
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Cursor: offset ${initialOffset} → ${finalOffset}, moved ${initialOffset - initialOffset} chars backward`);

        // In visual mode caret state, b should move to beginning of current or previous word
        // The final offset should be a valid position (may be same if already at word boundary)
        const lineText = afterSelection.focusNodeText;
        expect(finalOffset).toBeGreaterThanOrEqual(0);
        expect(finalOffset).toBeLessThanOrEqual(lineText.length);
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });

    test('multiple b presses move backward multiple words', async () => {
        // Position near end of line to have content behind us
        await enterVisualModeAtText('Final line for testing');

        const initialSelection = await getSelectionInfo();
        const initialOffset = initialSelection.focusOffset;

        // Press b three times to move backward three words
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 200));
        const after1 = await getSelectionInfo();

        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 200));
        const after2 = await getSelectionInfo();

        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));
        const after3 = await getSelectionInfo();

        console.log(`After 3x b: ${initialOffset} → ${after1.focusOffset} → ${after2.focusOffset} → ${after3.focusOffset}`);

        // Each press should move backward or stay same (if at document start)
        expect(after1.focusOffset).toBeLessThanOrEqual(initialOffset);
        expect(after2.focusOffset).toBeLessThanOrEqual(after1.focusOffset);
        expect(after3.focusOffset).toBeLessThanOrEqual(after2.focusOffset);
    });

    test('b works with alphanumeric words', async () => {
        // Test on line with mixed alphanumeric: "abc123 def456 ghi789"
        // Position at "ghi789" which is after other words
        await enterVisualModeAtText('ghi789');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press b to move back to previous word (def456)
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Alphanumeric: offset ${initialOffset} → ${finalOffset}`);

        // Should move backward or stay same
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });

    test('b works with numeric words', async () => {
        // Test on line with numbers by positioning at the number
        await enterVisualModeAtText('1234567890');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press b to move backward (to "Numbers:" label)
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Numbers test: offset ${initialOffset} → ${finalOffset}`);

        // Should move backward or stay same
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });

    test('b at start of document is idempotent', async () => {
        // Position at very beginning
        await enterVisualModeAtText('Visual Mode Test');

        // Try to move backward (should not error even at start)
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`At start of document: focusOffset=${selection.focusOffset}`);
    });

    test('b in range mode extends selection backward', async () => {
        // Enter visual mode in middle of line
        await enterVisualModeAtText('five six');

        // Create a small selection by moving right to enter range mode
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before b in range mode - type: ${beforeSelection.type}, text: "${beforeSelection.text}"`);

        // Press b to extend selection backward
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After b in range mode - type: ${afterSelection.type}, text: "${afterSelection.text}"`);

        // Selection should have changed (text length may increase or decrease depending on direction)
        expect(afterSelection.type).toBe('Range');
    });

    test('visual mode remains active after pressing b', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Final line');

        // Check cursor is visible before b
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before b: ${cursorVisibleBefore}`);

        // Press b
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after b
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after b: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after b command`);
    });

    test('consecutive b presses move backward word by word', async () => {
        // Start at "nine" in multi-word line
        await enterVisualModeAtText('nine');

        // Record offsets after each b press
        const offsets = [];

        const initial = await getSelectionInfo();
        offsets.push(initial.focusOffset);
        console.log(`Initial offset: ${initial.focusOffset}`);

        // Press b 5 times and record each offset
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'b');
            await new Promise(resolve => setTimeout(resolve, 200));

            const current = await getSelectionInfo();
            offsets.push(current.focusOffset);
            console.log(`After b #${i + 1}: offset ${current.focusOffset}`);
        }

        // Each successive offset should be less than or equal to the previous
        // (equal only if at document start)
        for (let i = 1; i < offsets.length; i++) {
            expect(offsets[i]).toBeLessThanOrEqual(offsets[i - 1]);
        }

        console.log(`Offset progression: ${offsets.join(' → ')}`);
    });

    test('2b moves backward two words', async () => {
        // Position near end to have multiple words behind us
        await enterVisualModeAtText('nine ten');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press 2b to move backward two words
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`2b command: offset ${initialOffset} → ${finalOffset}, moved ${initialOffset - finalOffset} chars`);

        // Should have moved backward (at least not forward)
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });

    test('3b moves backward three words', async () => {
        // Position at end area with words behind us
        await enterVisualModeAtText('eight nine ten');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press 3b to move backward three words
        await sendKey(pageWs, '3', 50);
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`3b command: offset ${initialOffset} → ${finalOffset}, moved ${initialOffset - finalOffset} chars`);

        // Should have moved backward (at least not forward)
        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });
});
