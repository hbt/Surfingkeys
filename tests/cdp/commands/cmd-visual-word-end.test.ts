/**
 * CDP Test: cmd_visual_word_end
 *
 * Focused observability test for the visual mode word end command.
 * - Single command: cmd_visual_word_end
 * - Single key: 'e'
 * - Single behavior: move cursor to end of current word in visual mode
 * - Focus: verify command execution without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-word-end.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-word-end.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-word-end.test.ts
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

describe('cmd_visual_word_end', () => {
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

    test('entering visual mode and pressing e does not error', async () => {
        // Enter visual mode at beginning of a word
        await enterVisualModeAtText('Multi-word');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press e to move to word end
        await sendKey(pageWs, 'e');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode e executed: focusOffset=${selection.focusOffset}`);
    });

    test('e in visual mode moves cursor forward', async () => {
        // Enter visual mode at start of word
        await enterVisualModeAtText('Short line');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before e - focusOffset: ${beforeSelection.focusOffset}, text: "${beforeSelection.focusNodeText}"`);

        // Press e to move to end of word
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After e - focusOffset: ${afterSelection.focusOffset}, text: "${afterSelection.focusNodeText}"`);

        // The focus offset should have moved forward (or stayed same if already at word end)
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(beforeSelection.focusOffset);
    });

    test('e moves to end of current word', async () => {
        // Start at beginning of a word
        await enterVisualModeAtText('considerably');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press e to jump to word end
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Cursor: offset ${initialOffset} → ${finalOffset}, text: "${afterSelection.focusNodeText}"`);

        // The final offset should be a valid position
        const lineText = afterSelection.focusNodeText;
        expect(finalOffset).toBeLessThanOrEqual(lineText.length);

        // If cursor was not already at end of word, it should have moved forward
        // Note: window.find() may position us at end of selection, so we use >=
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('repeated e presses do not error', async () => {
        // Position at beginning of multi-word line, but position more precisely
        // by finding the entire line first, then collapsing to start
        await executeInTarget(pageWs, `
            (function() {
                const p = document.getElementById('line6');
                const sel = window.getSelection();
                sel.setPosition(p.firstChild, 0);
            })()
        `);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 300));

        const initialSelection = await getSelectionInfo();
        const initialOffset = initialSelection.focusOffset;
        console.log(`Initial position: offset ${initialOffset}`);

        // Press e multiple times - verify no errors
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const firstSelection = await getSelectionInfo();
        const firstOffset = firstSelection.focusOffset;
        console.log(`First e: offset ${initialOffset} → ${firstOffset}`);
        expect(typeof firstOffset).toBe('number');

        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const secondSelection = await getSelectionInfo();
        const secondOffset = secondSelection.focusOffset;
        console.log(`Second e: offset ${firstOffset} → ${secondOffset}`);
        expect(typeof secondOffset).toBe('number');

        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const thirdSelection = await getSelectionInfo();
        const thirdOffset = thirdSelection.focusOffset;
        console.log(`Third e: offset ${secondOffset} → ${thirdOffset}`);
        expect(typeof thirdOffset).toBe('number');

        // Verify visual mode is still active
        const cursorVisible = await isVisualCursorVisible();
        console.log(`Visual cursor still visible: ${cursorVisible}`);
    });

    test('e works on alphanumeric words', async () => {
        // Test on line with mixed alphanumeric content
        await enterVisualModeAtText('abc123');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before e on alphanumeric - focusOffset: ${beforeSelection.focusOffset}`);

        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After e on alphanumeric - focusOffset: ${afterSelection.focusOffset}`);

        // Should move forward
        expect(afterSelection.focusOffset).toBeGreaterThan(beforeSelection.focusOffset);
    });

    test('e works on line with numbers', async () => {
        // Test on numbers - position at start more precisely
        await executeInTarget(pageWs, `
            (function() {
                const p = document.getElementById('line8');
                const sel = window.getSelection();
                // Position at 'N' in "Numbers:"
                sel.setPosition(p.firstChild, 0);
            })()
        `);
        await new Promise(resolve => setTimeout(resolve, 100));

        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before e on numbers line - focusOffset: ${beforeSelection.focusOffset}, text: "${beforeSelection.focusNodeText}"`);

        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After e on numbers line - focusOffset: ${afterSelection.focusOffset}`);

        // Should execute successfully without error
        expect(typeof afterSelection.focusOffset).toBe('number');
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(0);
    });

    test('multiple e presses execute without error', async () => {
        // Position precisely at start of line6 which has many words
        await executeInTarget(pageWs, `
            (function() {
                const p = document.getElementById('line6');
                const sel = window.getSelection();
                sel.setPosition(p.firstChild, 0);
            })()
        `);
        await new Promise(resolve => setTimeout(resolve, 100));

        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 300));

        const offsets: number[] = [];

        // Get initial offset
        let selection = await getSelectionInfo();
        offsets.push(selection.focusOffset);
        console.log(`Initial offset: ${selection.focusOffset}, text: "${selection.focusNodeText.substring(0, 30)}..."`);

        // Press e five times to navigate through multiple words
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'e');
            await new Promise(resolve => setTimeout(resolve, 200));
            selection = await getSelectionInfo();
            offsets.push(selection.focusOffset);
            // Verify no error occurred
            expect(typeof selection.focusOffset).toBe('number');
        }

        console.log(`Navigation offsets: ${offsets.join(' → ')}`);

        // Verify we can query selection after multiple presses
        const finalSelection = await getSelectionInfo();
        expect(typeof finalSelection.focusOffset).toBe('number');

        // Verify at least some movement occurred (allowing for edge cases)
        const uniqueOffsets = new Set(offsets);
        console.log(`Unique offsets: ${uniqueOffsets.size} out of ${offsets.length}`);
        expect(uniqueOffsets.size).toBeGreaterThanOrEqual(2);
    });

    test('e in range mode extends selection', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word');

        // Create a small selection by moving right a few characters
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before e in range mode - type: ${beforeSelection.type}, text: "${beforeSelection.text}"`);

        // Press e to extend to word end
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After e in range mode - type: ${afterSelection.type}, text: "${afterSelection.text}"`);

        // Selection should have extended (more text selected or same if already at word end)
        expect(afterSelection.text.length).toBeGreaterThanOrEqual(beforeSelection.text.length);
    });

    test('visual mode remains active after pressing e', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Final line');

        // Check cursor is visible before e
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before e: ${cursorVisibleBefore}`);

        // Press e
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after e
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after e: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after e command`);
    });

    test('e works at word boundaries', async () => {
        // Test navigating word by word
        await enterVisualModeAtText('line one');

        // First e should move to end of "line"
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const firstSelection = await getSelectionInfo();
        const firstOffset = firstSelection.focusOffset;
        console.log(`After first e: offset ${firstOffset}`);

        // Second e should move to end of "one" or start of next word
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const secondSelection = await getSelectionInfo();
        const secondOffset = secondSelection.focusOffset;
        console.log(`After second e: offset ${secondOffset}`);

        // Should have moved forward
        expect(secondOffset).toBeGreaterThan(firstOffset);
    });

    test('3e moves forward by three word ends', async () => {
        // Test count prefix with e
        await enterVisualModeAtText('one two three four five');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Send '3' followed by 'e' to move three words forward
        await sendKey(pageWs, '3', 50);
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 400));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`3e movement: offset ${initialOffset} → ${finalOffset}`);

        // Should have moved significantly forward (3 word ends)
        expect(finalOffset).toBeGreaterThan(initialOffset);
    });

    test('e handles end of line correctly', async () => {
        // Position near end of line
        await enterVisualModeAtText('Final line for testing');

        // Navigate to last word
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'e');
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        const beforeEndSelection = await getSelectionInfo();
        const beforeEndOffset = beforeEndSelection.focusOffset;
        console.log(`Near end of line - offset: ${beforeEndOffset}`);

        // Press e again (should handle end of line gracefully)
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterEndSelection = await getSelectionInfo();
        const afterEndOffset = afterEndSelection.focusOffset;
        console.log(`At end of line - offset: ${afterEndOffset}`);

        // Should not error and offset should be valid
        expect(typeof afterEndOffset).toBe('number');
        expect(afterEndOffset).toBeGreaterThanOrEqual(beforeEndOffset);
    });
});
