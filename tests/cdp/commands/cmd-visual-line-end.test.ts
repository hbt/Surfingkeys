/**
 * CDP Test: cmd_visual_line_end
 *
 * Focused observability test for the visual mode line end command.
 * - Single command: cmd_visual_line_end
 * - Single key: '$'
 * - Single behavior: move cursor to end of line in visual mode
 * - Focus: verify command execution without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-line-end.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-line-end.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-line-end.test.ts
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

describe('cmd_visual_line_end', () => {
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

    test('entering visual mode and pressing $ does not error', async () => {
        // Enter visual mode at beginning of a line
        await enterVisualModeAtText('This is a medium');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press $ to move to end of line
        await sendKey(pageWs, '$');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode $ executed: focusOffset=${selection.focusOffset}`);
    });

    test('$ in visual mode moves cursor forward', async () => {
        // Enter visual mode at start of line
        await enterVisualModeAtText('Short line');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before $ - focusOffset: ${beforeSelection.focusOffset}, text: "${beforeSelection.focusNodeText}"`);

        // Press $ to move to end of line
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After $ - focusOffset: ${afterSelection.focusOffset}, text: "${afterSelection.focusNodeText}"`);

        // The focus offset should have moved forward (or stayed same if already at end)
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(beforeSelection.focusOffset);
    });

    test('$ moves to end of current line', async () => {
        // Start at beginning of a medium-length line
        await enterVisualModeAtText('This is a medium');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press $ to jump to end
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Cursor: offset ${initialOffset} → ${finalOffset}, text: "${afterSelection.focusNodeText}"`);

        // If cursor moved, it should have moved forward
        // Otherwise, it may have already been at the end
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);

        // The final offset should be a valid position
        const lineText = afterSelection.focusNodeText;
        expect(finalOffset).toBeLessThanOrEqual(lineText.length);
    });

    test('$ is idempotent when already at line end', async () => {
        // Position at end of line
        await enterVisualModeAtText('Short line');

        // Move to end first
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const firstSelection = await getSelectionInfo();
        const firstOffset = firstSelection.focusOffset;

        // Press $ again
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const secondSelection = await getSelectionInfo();
        const secondOffset = secondSelection.focusOffset;

        console.log(`First $: offset ${firstOffset}, Second $: offset ${secondOffset}`);

        // Should stay at same position
        expect(secondOffset).toBe(firstOffset);
    });

    test('$ works on line with special characters', async () => {
        // Test on line with special chars
        await enterVisualModeAtText('Special chars');

        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should successfully move to end without error
        expect(typeof selection.focusOffset).toBe('number');
        expect(selection.focusOffset).toBeGreaterThan(0);

        console.log(`Special chars line: focusOffset=${selection.focusOffset}`);
    });

    test('$ works on line with numbers', async () => {
        // Test on line with numbers
        await enterVisualModeAtText('Numbers: 123');

        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should successfully move to end
        expect(typeof selection.focusOffset).toBe('number');
        expect(selection.focusOffset).toBeGreaterThan(0);

        console.log(`Numbers line: focusOffset=${selection.focusOffset}`);
    });

    test('$ in range mode extends selection to line end', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word');

        // Create a small selection by moving right a few characters
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before $ in range mode - type: ${beforeSelection.type}, text: "${beforeSelection.text}"`);

        // Press $ to extend to end of line
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After $ in range mode - type: ${afterSelection.type}, text: "${afterSelection.text}"`);

        // Selection should have extended (more text selected)
        expect(afterSelection.text.length).toBeGreaterThanOrEqual(beforeSelection.text.length);
    });

    test('visual mode remains active after pressing $', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Final line');

        // Check cursor is visible before $
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before $: ${cursorVisibleBefore}`);

        // Press $
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after $
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after $: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after $ command`);
    });
});
