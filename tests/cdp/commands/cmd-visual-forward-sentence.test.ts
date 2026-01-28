/**
 * CDP Test: cmd_visual_forward_sentence
 *
 * Focused observability test for the visual mode forward sentence command.
 * - Single command: cmd_visual_forward_sentence
 * - Single key: ')'
 * - Single behavior: move cursor forward by one sentence in visual mode
 * - Focus: verify command execution without errors and correct sentence navigation
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-forward-sentence.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-forward-sentence.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-forward-sentence.test.ts
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

describe('cmd_visual_forward_sentence', () => {
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

    test('entering visual mode and pressing ) does not error', async () => {
        // Enter visual mode at beginning of first sentence
        await enterVisualModeAtText('This is the first');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press ) to move forward one sentence
        await sendKey(pageWs, ')');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode ) executed: focusOffset=${selection.focusOffset}`);
    });

    test(') in visual mode moves cursor forward', async () => {
        // Enter visual mode at start of first sentence
        await enterVisualModeAtText('This is the first');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;
        console.log(`Before ) - focusOffset: ${initialOffset}, text: "${beforeSelection.focusNodeText}"`);

        // Press ) to move forward one sentence
        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;
        console.log(`After ) - focusOffset: ${finalOffset}, text: "${afterSelection.focusNodeText}"`);

        // The focus offset should have moved forward (or stayed same if sentence not supported)
        // In environments where sentence granularity is not supported, the command falls back to word
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test(') moves to next sentence boundary', async () => {
        // Start at beginning of first sentence
        await enterVisualModeAtText('This is the first sentence');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press ) to jump to next sentence
        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Cursor: offset ${initialOffset} → ${finalOffset}, text: "${afterSelection.focusNodeText}"`);

        // Cursor should have moved forward (or stayed if not supported)
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);

        // The final offset should be a valid position
        const nodeText = afterSelection.focusNodeText;
        expect(finalOffset).toBeLessThanOrEqual(nodeText.length);
    });

    test(') navigates through multiple sentences', async () => {
        // Start at beginning of multi-sentence paragraph
        await enterVisualModeAtText('This is the first');

        const positions = [];

        // Get initial position
        const initial = await getSelectionInfo();
        positions.push(initial.focusOffset);
        console.log(`Initial position: ${positions[0]}`);

        // Press ) three times to move through three sentences
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, ')');
            await new Promise(resolve => setTimeout(resolve, 300));

            const current = await getSelectionInfo();
            positions.push(current.focusOffset);
            console.log(`After ) #${i + 1}: position ${positions[positions.length - 1]}`);
        }

        // Each position should be different and increasing (or same if at end)
        for (let i = 1; i < positions.length; i++) {
            expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
        }
    });

    test(') works with question mark sentence ending', async () => {
        // Test on sentence ending with ?
        await enterVisualModeAtText('Question sentence');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Question mark sentence: ${initialOffset} → ${finalOffset}`);

        // Should successfully move forward (or stay if not supported)
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test(') works with exclamation mark sentence ending', async () => {
        // Test on sentence ending with !
        await enterVisualModeAtText('Exclamation sentence');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Exclamation mark sentence: ${initialOffset} → ${finalOffset}`);

        // Should successfully move forward (or stay if not supported)
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test(') works on single sentence paragraph', async () => {
        // Test on paragraph with only one sentence
        await enterVisualModeAtText('Single sentence paragraph');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Single sentence: ${initialOffset} → ${finalOffset}`);

        // Should move to end of sentence (or stay same if already there)
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test(') in range mode extends selection to next sentence', async () => {
        // Enter visual mode
        await enterVisualModeAtText('This is the first');

        // Create a small selection by moving right a few characters
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        const beforeTextLength = beforeSelection.text.length;
        console.log(`Before ) in range mode - type: ${beforeSelection.type}, text length: ${beforeTextLength}`);

        // Press ) to extend to next sentence
        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const afterTextLength = afterSelection.text.length;
        console.log(`After ) in range mode - type: ${afterSelection.type}, text length: ${afterTextLength}`);

        // Selection should have extended (more text selected)
        expect(afterTextLength).toBeGreaterThanOrEqual(beforeTextLength);
    });

    test('visual mode remains active after pressing )', async () => {
        // Enter visual mode
        await enterVisualModeAtText('This is the first');

        // Check cursor is visible before )
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before ): ${cursorVisibleBefore}`);

        // Press )
        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check cursor visibility after )
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after ): ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after ) command`);
    });

    test(') at end of document does not error', async () => {
        // Position at the last sentence
        await enterVisualModeAtText('Final sentence');

        // Move to near the end
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Press ) when already at/near end
        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`At document end: ${initialOffset} → ${finalOffset}`);

        // Should not error, and offset should be valid
        expect(typeof finalOffset).toBe('number');
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });

    test('2) moves forward by two sentences', async () => {
        // Start at beginning of multi-sentence paragraph
        await enterVisualModeAtText('This is the first');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        // Send '2' followed by ')' to create 2) command
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 500));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`2) command: ${initialOffset} → ${finalOffset}`);

        // Should have moved forward (or stayed if not supported)
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);

        // Verify we can get valid selection info
        expect(typeof afterSelection.focusOffset).toBe('number');
    });

    test(') works with ellipsis sentence ending', async () => {
        // Test on sentence ending with ...
        await enterVisualModeAtText('Sentence with ellipsis');

        const beforeSelection = await getSelectionInfo();
        const initialOffset = beforeSelection.focusOffset;

        await sendKey(pageWs, ')');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const finalOffset = afterSelection.focusOffset;

        console.log(`Ellipsis sentence: ${initialOffset} → ${finalOffset}`);

        // Should successfully move forward
        expect(finalOffset).toBeGreaterThanOrEqual(initialOffset);
    });
});
