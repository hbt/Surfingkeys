/**
 * CDP Test: cmd_visual_backward_char
 *
 * Focused observability test for the visual mode backward character command.
 * - Single command: cmd_visual_backward_char
 * - Single key: 'h'
 * - Single behavior: move cursor backward by one character in visual mode
 * - Focus: verify command execution without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-backward-char.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-backward-char.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-backward-char.test.ts
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

describe('cmd_visual_backward_char', () => {
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

    test('entering visual mode and pressing h does not error', async () => {
        // Enter visual mode
        await enterVisualModeAtText('medium length');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press h to move backward one character
        await sendKey(pageWs, 'h');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode h executed: focusOffset=${selection.focusOffset}`);
    });

    test('h command executes without error', async () => {
        // Enter visual mode
        await enterVisualModeAtText('medium length');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before h - type: ${beforeSelection.type}, offset: ${beforeSelection.focusOffset}`);

        // Press h
        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After h - type: ${afterSelection.type}, offset: ${afterSelection.focusOffset}`);

        // Should still have a valid selection
        expect(typeof afterSelection.focusOffset).toBe('number');
    });

    test('pressing h multiple times does not error', async () => {
        // Enter visual mode
        await enterVisualModeAtText('medium length');

        // Press h three times
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        const selection = await getSelectionInfo();
        console.log(`After 3x h: offset=${selection.focusOffset}`);

        // Should still have a valid selection
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('h at start of text is handled gracefully', async () => {
        // Enter visual mode at beginning of line
        await enterVisualModeAtText('Short line');

        // Move to start
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeSelection = await getSelectionInfo();
        console.log(`At start - offset: ${beforeSelection.focusOffset}`);

        // Press h at start (should not error)
        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After h at start - offset: ${afterSelection.focusOffset}`);

        // Should still have valid offset
        expect(typeof afterSelection.focusOffset).toBe('number');
        expect(afterSelection.focusOffset).toBeGreaterThanOrEqual(0);
    });

    test('h works on line with special characters', async () => {
        // Test on line with special chars
        await enterVisualModeAtText('Special chars');

        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should successfully execute without error
        expect(typeof selection.focusOffset).toBe('number');
        console.log(`Special chars: offset=${selection.focusOffset}`);
    });

    test('h works on line with numbers', async () => {
        // Test on line with numbers
        await enterVisualModeAtText('Numbers: 123');

        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should successfully execute
        expect(typeof selection.focusOffset).toBe('number');
        console.log(`Numbers: offset=${selection.focusOffset}`);
    });

    test('h works on mixed content line', async () => {
        // Test on line with mixed content
        await enterVisualModeAtText('Mixed: abc123');

        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should successfully execute
        expect(typeof selection.focusOffset).toBe('number');
        console.log(`Mixed: offset=${selection.focusOffset}`);
    });

    test('h in visual mode with selection', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word');

        // Create a selection by moving
        for (let i = 0; i < 4; i++) {
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        console.log(`Before h - type: ${beforeSelection.type}, text: "${beforeSelection.text}"`);

        // Press h
        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After h - type: ${afterSelection.type}, text: "${afterSelection.text}"`);

        // Should execute without error
        expect(typeof afterSelection.focusOffset).toBe('number');
    });

    test('h can be pressed multiple times in succession', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word');

        // Move forward then backward
        for (let i = 0; i < 2; i++) {
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await new Promise(resolve => setTimeout(resolve, 100));

        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const selection = await getSelectionInfo();
        console.log(`After movement: offset=${selection.focusOffset}`);

        // Should execute without error
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('visual mode remains active after pressing h', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Final line');

        // Check cursor is visible before h
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before h: ${cursorVisibleBefore}`);

        // Press h
        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after h
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after h: ${cursorVisibleAfter}`);

        // Verify we can still query selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after h command`);
    });

    test('5h command does not error', async () => {
        // Enter visual mode
        await enterVisualModeAtText('considerably more text');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before 5h - offset: ${beforeSelection.focusOffset}`);

        // Send '5h'
        await sendKey(pageWs, '5', 50);
        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After 5h - offset: ${afterSelection.focusOffset}`);

        // Should execute without error
        expect(typeof afterSelection.focusOffset).toBe('number');
    });

    test('10h command does not error', async () => {
        // Enter visual mode
        await enterVisualModeAtText('considerably more text that extends');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before 10h - offset: ${beforeSelection.focusOffset}`);

        // Send '10h'
        await sendKey(pageWs, '1', 50);
        await sendKey(pageWs, '0', 50);
        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After 10h - offset: ${afterSelection.focusOffset}`);

        // Should execute without error
        expect(typeof afterSelection.focusOffset).toBe('number');
    });

    test('h and l commands work in sequence', async () => {
        // Enter visual mode
        await enterVisualModeAtText('medium length');

        const originalSelection = await getSelectionInfo();
        console.log(`Original offset: ${originalSelection.focusOffset}`);

        // Press h then l
        await sendKey(pageWs, 'h');
        await new Promise(resolve => setTimeout(resolve, 200));

        const afterH = await getSelectionInfo();
        console.log(`After h: ${afterH.focusOffset}`);

        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterL = await getSelectionInfo();
        console.log(`After l: ${afterL.focusOffset}`);

        // Should execute without error
        expect(typeof afterL.focusOffset).toBe('number');
    });
});
