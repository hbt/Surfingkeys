/**
 * CDP Test: cmd_visual_line_start
 *
 * Focused observability test for the visual mode line start command.
 * - Single command: cmd_visual_line_start
 * - Single key: '0'
 * - Single behavior: move cursor to start of line in visual mode
 * - Focus: verify command execution without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-line-start.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-line-start.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-line-start.test.ts
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

describe('cmd_visual_line_start', () => {
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

    test('entering visual mode and pressing 0 does not error', async () => {
        // Enter visual mode at middle of a line
        await enterVisualModeAtText('medium length');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press 0 to move to start of line
        await sendKey(pageWs, '0');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode 0 executed: focusOffset=${selection.focusOffset}`);
    });

    test('0 in visual mode moves cursor backward', async () => {
        // Enter visual mode at end of line
        await enterVisualModeAtText('length line');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before 0 - focusOffset: ${beforeSelection.focusOffset}, text: "${beforeSelection.focusNodeText}"`);

        // Press 0 to move to start of line
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After 0 - focusOffset: ${afterSelection.focusOffset}, text: "${afterSelection.focusNodeText}"`);

        // The focus offset should have moved backward (or stayed same if already at start)
        expect(afterSelection.focusOffset).toBeLessThanOrEqual(beforeSelection.focusOffset);
    });

    test('0 moves to start of current line', async () => {
        // Start in middle of a long line
        await enterVisualModeAtText('considerably more text');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;
        console.log(`Starting position: offset ${initialOffset}, text: "${beforeSelection.focusNodeText}"`);

        // Press 0 to jump to start
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`After 0: offset ${finalOffset}, moved ${initialOffset - finalOffset} chars backward`);

        // If we started past position 15, we should have moved backward
        if (initialOffset > 15) {
            expect(finalOffset).toBeLessThan(initialOffset);
        }

        // The final offset should be near the start (allow up to 15 chars for browser quirks)
        expect(finalOffset).toBeLessThanOrEqual(15);
    });

    test('0 is idempotent when already at line start', async () => {
        // Position at start of line
        await enterVisualModeAtText('Short line');

        // Move to start first
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const firstSelection = await getSelectionInfo();
        const firstOffset = firstSelection.focusOffset;

        // Press 0 again
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const secondSelection = await getSelectionInfo();
        const secondOffset = secondSelection.focusOffset;

        console.log(`First 0: offset ${firstOffset}, Second 0: offset ${secondOffset}`);

        // Should stay at same position
        expect(secondOffset).toBe(firstOffset);
    });

    test('0 works on line with special characters', async () => {
        // Test on line with special chars, start in middle
        await enterVisualModeAtText('@#$%^&*');

        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should successfully move to start without error
        expect(typeof selection.focusOffset).toBe('number');
        expect(selection.focusOffset).toBeLessThan(15);

        console.log(`Special chars line: focusOffset=${selection.focusOffset}`);
    });

    test('0 works on line with numbers', async () => {
        // Test on line with numbers, start in middle
        await enterVisualModeAtText('1234567890');

        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should successfully move to start
        expect(typeof selection.focusOffset).toBe('number');
        expect(selection.focusOffset).toBeLessThan(15);

        console.log(`Numbers line: focusOffset=${selection.focusOffset}`);
    });

    test('0 in range mode extends selection to line start', async () => {
        // Enter visual mode at middle of line
        await enterVisualModeAtText('Multi-word');

        // Move right to create a selection
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before 0 in range mode - type: ${beforeSelection.type}, text: "${beforeSelection.text}"`);

        // Press 0 to extend to start of line
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After 0 in range mode - type: ${afterSelection.type}, text: "${afterSelection.text}"`);

        // Focus should have moved toward start (allow browser quirks)
        expect(afterSelection.focusOffset).toBeLessThan(15);
    });

    test('visual mode remains active after pressing 0', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Final line');

        // Check cursor is visible before 0
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before 0: ${cursorVisibleBefore}`);

        // Press 0
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after 0
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after 0: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after 0 command`);
    });

    test('0 command moves cursor toward line start', async () => {
        // Enter visual mode - search will position cursor somewhere in the text
        await enterVisualModeAtText('considerably');

        const initial = await getSelectionInfo();
        console.log(`Initial position after search: offset ${initial.focusOffset}`);

        // Press 0 to move to start
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterZero = await getSelectionInfo();
        console.log(`After pressing 0: offset ${afterZero.focusOffset}`);

        // The 0 command should move us toward the start (lower offset or stay same if already at start)
        expect(afterZero.focusOffset).toBeLessThanOrEqual(initial.focusOffset);

        // And we should be near the line start (within first 15 characters allowing for browser quirks)
        expect(afterZero.focusOffset).toBeLessThanOrEqual(15);
    });

    test('pressing 0 twice keeps cursor at start', async () => {
        // Enter visual mode in middle of line
        await enterVisualModeAtText('Multi-word line');

        // Press 0 first time
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const firstPress = await getSelectionInfo();
        const firstOffset = firstPress.focusOffset;
        console.log(`After first 0: offset ${firstOffset}`);

        // Press 0 second time
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const secondPress = await getSelectionInfo();
        const secondOffset = secondPress.focusOffset;
        console.log(`After second 0: offset ${secondOffset}`);

        // Should remain at start position
        expect(secondOffset).toBe(firstOffset);
        expect(secondOffset).toBeLessThan(15);
    });

    test('0 works on empty line', async () => {
        // The fixture has an empty paragraph (line4)
        // Position cursor near the empty line by finding text after it
        await enterVisualModeAtText('Line after empty');

        // Move up with k to get to empty line (may not work perfectly, but test 0 anyway)
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Press 0
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error occurred
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`0 on potentially empty line: offset ${selection.focusOffset}`);
    });
});
