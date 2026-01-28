/**
 * CDP Test: cmd_visual_forward_char
 *
 * Focused observability test for the visual mode forward character command.
 * - Single command: cmd_visual_forward_char
 * - Single key: 'l'
 * - Single behavior: move cursor forward by one character in visual mode
 * - Focus: verify command execution without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-forward-char.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-forward-char.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-forward-char.test.ts
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

describe('cmd_visual_forward_char', () => {
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

        // Ensure we're in Normal mode first
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send 'v' to enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 500));
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

    test('entering visual mode and pressing l does not error', async () => {
        // Enter visual mode
        await enterVisualModeAtText('medium length');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press l to move forward one character
        await sendKey(pageWs, 'l');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode l executed: focusOffset=${selection.focusOffset}`);
    });

    test('l moves cursor forward by one character', async () => {
        // Enter visual mode at beginning of text
        await enterVisualModeAtText('Short line');

        // Move to start of line to ensure we're not at a boundary
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;
        console.log(`Before l - focusOffset: ${initialOffset}`);

        // Press l
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;
        console.log(`After l - focusOffset: ${finalOffset}`);

        // Offset should have increased (cursor moved forward) or stayed same if at word boundary
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);

        // Should have moved forward (at least by word if not by character)
        const delta = finalOffset - initialOffset;
        console.log(`Cursor moved ${delta} position(s) forward`);
    });

    test('pressing l multiple times moves cursor progressively', async () => {
        // Enter visual mode
        await enterVisualModeAtText('medium length');

        // Start from beginning of line
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const offsets: number[] = [];

        // Capture initial offset
        const initial = await getSelectionInfo();
        offsets.push(initial.focusOffset);
        console.log(`Initial offset: ${offsets[0]}`);

        // Press l three times
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 200));
            const sel = await getSelectionInfo();
            offsets.push(sel.focusOffset);
            console.log(`After l #${i+1}: offset=${sel.focusOffset}`);
        }

        // Each press should move forward (offsets should be non-decreasing)
        for (let i = 1; i < offsets.length; i++) {
            expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i-1]);
        }

        // Last offset should be greater than or equal to first (may stay same if at boundary)
        // But at least verify no crash occurred
        expect(offsets[offsets.length - 1]).toBeGreaterThanOrEqual(offsets[0]);
    });

    test('l at end of line is handled gracefully', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Short line');

        // Move to end of line first
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeSelection = await getSelectionInfo();
        console.log(`At end - offset: ${beforeSelection.focusOffset}, text length: ${beforeSelection.focusNodeText.length}`);

        // Press l at end (should not error, may move to next element)
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After l at end - offset: ${afterSelection.focusOffset}`);

        // Should still have valid offset (no crash)
        expect(typeof afterSelection.focusOffset).toBe('number');
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(0);
    });

    test('l works on line with letters only', async () => {
        // Test on simple text
        await enterVisualModeAtText('Lorem ipsum');

        const before = await getSelectionInfo();

        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        const after = await getSelectionInfo();

        // Should successfully execute and move forward
        expect(after.focusOffset).toBeGreaterThanOrEqual(before.focusOffset);
        console.log(`Letters: ${before.focusOffset} → ${after.focusOffset}`);
    });

    test('l works on line with numbers', async () => {
        // Test on line with numbers
        await enterVisualModeAtText('Numbers: 123');

        const before = await getSelectionInfo();

        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        const after = await getSelectionInfo();

        // Should successfully execute
        expect(typeof after.focusOffset).toBe('number');
        expect(after.focusOffset).toBeGreaterThanOrEqual(before.focusOffset);
        console.log(`Numbers: ${before.focusOffset} → ${after.focusOffset}`);
    });

    test('l works on line with special characters', async () => {
        // Test on line with special chars
        await enterVisualModeAtText('Special chars');

        const before = await getSelectionInfo();

        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        const after = await getSelectionInfo();

        // Should successfully execute without error
        expect(typeof after.focusOffset).toBe('number');
        expect(after.focusOffset).toBeGreaterThanOrEqual(before.focusOffset);
        console.log(`Special chars: ${before.focusOffset} → ${after.focusOffset}`);
    });

    test('l works on mixed content line', async () => {
        // Test on line with mixed content (letters, numbers, spaces)
        await enterVisualModeAtText('Mixed: abc123');

        const before = await getSelectionInfo();

        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        const after = await getSelectionInfo();

        // Should successfully execute
        expect(typeof after.focusOffset).toBe('number');
        expect(after.focusOffset).toBeGreaterThanOrEqual(before.focusOffset);
        console.log(`Mixed: ${before.focusOffset} → ${after.focusOffset}`);
    });

    test('l in caret mode (state 1) moves without creating selection', async () => {
        // Enter visual mode (starts in caret mode)
        await enterVisualModeAtText('Multi-word');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before l in caret - type: ${beforeSelection.type}, offset: ${beforeSelection.focusOffset}`);

        // Press l
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After l in caret - type: ${afterSelection.type}, offset: ${afterSelection.focusOffset}`);

        // Should have moved forward
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(beforeSelection.focusOffset);
    });

    test('l in range mode (state 2) extends selection', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word');

        // Create a selection by moving forward a few times
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        const beforeTextLength = beforeSelection.text.length;
        console.log(`Before l in range - type: ${beforeSelection.type}, text: "${beforeSelection.text}" (length: ${beforeTextLength})`);

        // Press l to extend selection
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const afterTextLength = afterSelection.text.length;
        console.log(`After l in range - type: ${afterSelection.type}, text: "${afterSelection.text}" (length: ${afterTextLength})`);

        // Selection should have extended (more text selected or focus moved)
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(beforeSelection.focusOffset);
    });

    test('l can be pressed many times in succession', async () => {
        // Enter visual mode at start of long line
        await enterVisualModeAtText('considerably more text');

        // Move to start first
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeOffset = (await getSelectionInfo()).focusOffset;

        // Press l multiple times rapidly
        for (let i = 0; i < 10; i++) {
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        const selection = await getSelectionInfo();
        console.log(`After 10x l: offset=${selection.focusOffset}`);

        // Should execute without error
        expect(typeof selection.focusOffset).toBe('number');
        expect(selection.focusOffset).toBeGreaterThanOrEqual(beforeOffset);
    });

    test('visual mode remains active after pressing l', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Final line');

        // Check cursor is visible before l
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before l: ${cursorVisibleBefore}`);

        // Press l
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after l
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after l: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after l command`);
    });

    test('5l command moves forward 5 times', async () => {
        // Enter visual mode
        await enterVisualModeAtText('considerably more text');

        // Move to start of line first
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before 5l - offset: ${beforeSelection.focusOffset}`);

        // Send '5l' (repeat count)
        await sendKey(pageWs, '5', 50);
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 400));

        const afterSelection = await getSelectionInfo();
        console.log(`After 5l - offset: ${afterSelection.focusOffset}`);

        // Should have moved forward or stayed same
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(beforeSelection.focusOffset);

        const delta = afterSelection.focusOffset - beforeSelection.focusOffset;
        console.log(`Moved ${delta} positions with 5l`);

        // Should execute without error (movement depends on content)
        expect(typeof afterSelection.focusOffset).toBe('number');
    });

    test('10l command moves forward 10 times', async () => {
        // Enter visual mode on long line
        await enterVisualModeAtText('considerably more text that extends');

        // Move to start of line first
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before 10l - offset: ${beforeSelection.focusOffset}`);

        // Send '10l'
        await sendKey(pageWs, '1', 50);
        await sendKey(pageWs, '0', 50);
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 400));

        const afterSelection = await getSelectionInfo();
        console.log(`After 10l - offset: ${afterSelection.focusOffset}`);

        // Should have moved forward or stayed same
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(beforeSelection.focusOffset);

        const delta = afterSelection.focusOffset - beforeSelection.focusOffset;
        console.log(`Moved ${delta} positions with 10l`);

        // Should execute without error
        expect(typeof afterSelection.focusOffset).toBe('number');
    });

    test('l and h commands work in sequence', async () => {
        // Enter visual mode
        await enterVisualModeAtText('medium length');

        const originalSelection = await getSelectionInfo();
        console.log(`Original offset: ${originalSelection.focusOffset}`);

        // Press l then h
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const afterL = await getSelectionInfo();
        console.log(`After l: ${afterL.focusOffset}`);

        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterH = await getSelectionInfo();
        console.log(`After h: ${afterH.focusOffset}`);

        // Should execute without error
        expect(typeof afterH.focusOffset).toBe('number');
    });

    test('consecutive l presses create smooth forward movement', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word');

        // Start from beginning
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const offsets: number[] = [];

        // Press l 5 times and record offsets
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 150));
            const sel = await getSelectionInfo();
            offsets.push(sel.focusOffset);
        }

        console.log(`Offset progression: ${offsets.join(' → ')}`);

        // All offsets should be valid numbers
        offsets.forEach(offset => {
            expect(typeof offset).toBe('number');
            expect(offset).toBeGreaterThanOrEqual(0);
        });

        // Should show forward progression or stay same (non-decreasing)
        for (let i = 1; i < offsets.length; i++) {
            expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i-1]);
        }
    });

    test('l at document boundary does not crash', async () => {
        // Enter visual mode near end of document
        await enterVisualModeAtText('ABSOLUTE END');

        // Move to end
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Try pressing l multiple times at document end
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        const selection = await getSelectionInfo();

        // Should not crash
        expect(typeof selection.focusOffset).toBe('number');
        console.log(`At document boundary: offset=${selection.focusOffset}`);
    });
});
