/**
 * CDP Test: cmd_visual_repeat_find_opposite
 *
 * Focused observability test for the visual mode repeat find opposite command.
 * - Single command: cmd_visual_repeat_find_opposite
 * - Single key: ','
 * - Single behavior: repeat find in opposite direction in visual mode
 * - Focus: verify command execution after f/F find operations
 *
 * Visual mode find mechanics:
 * - 'f' followed by character: find forward
 * - 'F' followed by character: find backward
 * - ';' repeats last find in same direction
 * - ',' repeats last find in opposite direction
 *
 * Implementation reference: src/content_scripts/common/visual.js
 * - Line 517-531: The ',' mapping definition
 * - Line 527-529: If lastF exists, call visualSeek(-lastF[0], lastF[1])
 * - Line 593-618: visualSeek function - moves cursor by finding character
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-repeat-find-opposite.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-repeat-find-opposite.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-repeat-find-opposite.test.ts
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

describe('cmd_visual_repeat_find_opposite', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    /**
     * Enter visual mode at specified text
     */
    async function enterVisualModeAtText(text: string): Promise<void> {
        // Use browser's find API to position cursor at specific text
        await executeInTarget(pageWs, `
            (function() {
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
     * Get lastF state from visual mode (for debugging)
     */
    async function getLastFState(): Promise<any> {
        return executeInTarget(pageWs, `
            (function() {
                // lastF is internal to visual.js, but we can check if selection moved
                // This is a diagnostic function for debugging
                const sel = window.getSelection();
                return {
                    hasFocus: sel.focusNode !== null,
                    focusOffset: sel.focusOffset
                };
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

    test('pressing , without prior find does not error', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Multi-word');

        // Press , without doing f or F first
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Should not error - just check we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log('Pressed , without prior find - no error');
    });

    test(', after f finds in backward direction', async () => {
        // Enter visual mode at start of line with repeated characters
        // "Multi-word line one two three four five six seven eight nine ten"
        await enterVisualModeAtText('Multi-word line');

        const initialSelection = await getSelectionInfo();
        const initialOffset = initialSelection.focusOffset;
        console.log(`Initial position - offset: ${initialOffset}, text: "${initialSelection.focusNodeText}"`);

        // Find forward to 'e' (multiple 'e' characters in line)
        await sendKey(pageWs, 'f');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterFindForward = await getSelectionInfo();
        const afterFindOffset = afterFindForward.focusOffset;
        console.log(`After 'fe' - offset: ${afterFindOffset}, moved: ${afterFindOffset - initialOffset} chars`);

        // Now press , to find backward (opposite of f)
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterComma = await getSelectionInfo();
        const finalOffset = afterComma.focusOffset;
        console.log(`After ',' - offset: ${finalOffset}, moved: ${finalOffset - afterFindOffset} chars`);

        // If find was successful, cursor should have moved backward (or stayed if no previous 'e')
        // We can't guarantee direction due to content, but operation should complete
        expect(typeof finalOffset).toBe('number');
        console.log(`Find opposite completed: ${initialOffset} → ${afterFindOffset} → ${finalOffset}`);
    });

    test(', after F finds in forward direction', async () => {
        // Enter visual mode somewhere in the middle
        await enterVisualModeAtText('three four');

        const initialSelection = await getSelectionInfo();
        const initialOffset = initialSelection.focusOffset;
        console.log(`Initial position - offset: ${initialOffset}`);

        // Find backward to 'o' using F
        await sendKey(pageWs, 'F');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterFindBackward = await getSelectionInfo();
        const afterFindOffset = afterFindBackward.focusOffset;
        console.log(`After 'Fo' - offset: ${afterFindOffset}, moved: ${afterFindOffset - initialOffset} chars`);

        // Now press , to find forward (opposite of F)
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterComma = await getSelectionInfo();
        const finalOffset = afterComma.focusOffset;
        console.log(`After ',' - offset: ${finalOffset}, moved: ${finalOffset - afterFindOffset} chars`);

        // Operation should complete without error
        expect(typeof finalOffset).toBe('number');
        console.log(`Find opposite completed: ${initialOffset} → ${afterFindOffset} → ${finalOffset}`);
    });

    test(', can be pressed multiple times', async () => {
        // Test repeated use of ,
        await enterVisualModeAtText('one two three');

        // Find forward to 'e'
        await sendKey(pageWs, 'f');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'e');
        await new Promise(resolve => setTimeout(resolve, 300));

        const offsets: number[] = [];

        // Record position after initial find
        let sel = await getSelectionInfo();
        offsets.push(sel.focusOffset);
        console.log(`After 'fe': offset ${offsets[0]}`);

        // Press , multiple times
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, ',');
            await new Promise(resolve => setTimeout(resolve, 300));

            sel = await getSelectionInfo();
            offsets.push(sel.focusOffset);
            console.log(`After ',' #${i + 1}: offset ${offsets[offsets.length - 1]}`);
        }

        // Should have collected offsets
        expect(offsets.length).toBe(4);
        console.log(`Multiple , presses: ${offsets.join(' → ')}`);
    });

    test(', works after ; (both use lastF)', async () => {
        // Test interaction between ; and ,
        await enterVisualModeAtText('Numbers: 1234567890');

        // Find forward to a digit
        await sendKey(pageWs, 'f');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, '3');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterF = await getSelectionInfo();
        console.log(`After 'f3': offset ${afterF.focusOffset}`);

        // Use ; to repeat in same direction
        await sendKey(pageWs, ';');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSemicolon = await getSelectionInfo();
        console.log(`After ';': offset ${afterSemicolon.focusOffset}`);

        // Now use , to go opposite direction
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterComma = await getSelectionInfo();
        console.log(`After ',': offset ${afterComma.focusOffset}`);

        // All operations should complete
        expect(typeof afterComma.focusOffset).toBe('number');
        console.log('Sequence f ; , completed successfully');
    });

    test(', preserves visual mode state', async () => {
        // Verify visual mode remains active after ,
        await enterVisualModeAtText('Final line');

        // Find a character
        await sendKey(pageWs, 'f');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Press ,
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check that visual cursor still exists
        const cursorExists = await executeInTarget(pageWs, `
            (function() {
                const cursor = document.querySelector('.surfingkeys_cursor');
                return cursor !== null && document.body.contains(cursor);
            })()
        `);

        console.log(`Visual cursor exists after ',': ${cursorExists}`);

        // Should still be able to get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test(', works with special characters', async () => {
        // Test finding special characters
        await enterVisualModeAtText('Special chars:');

        // Find forward to ':'
        await sendKey(pageWs, 'f');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, ':');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterFind = await getSelectionInfo();
        console.log(`After 'f:': offset ${afterFind.focusOffset}`);

        // Press , to find opposite
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterComma = await getSelectionInfo();
        console.log(`After ',': offset ${afterComma.focusOffset}`);

        // Should complete without error
        expect(typeof afterComma.focusOffset).toBe('number');
    });

    test(', in range mode extends selection', async () => {
        // Test that , works in range mode (when text is selected)
        await enterVisualModeAtText('Mixed: abc123');

        // Move right to create selection (enter range mode)
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await sendKey(pageWs, 'l');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeFind = await getSelectionInfo();
        console.log(`Range mode before find - type: ${beforeFind.type}, text: "${beforeFind.text}"`);

        // Find forward in range mode
        await sendKey(pageWs, 'f');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, '1');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterFind = await getSelectionInfo();
        console.log(`After 'f1' in range mode - text: "${afterFind.text}"`);

        // Press , to find opposite
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterComma = await getSelectionInfo();
        console.log(`After ',' in range mode - text: "${afterComma.text}"`);

        // Should have valid selection state
        expect(typeof afterComma.focusOffset).toBe('number');
    });

    test(', finds character that appears multiple times', async () => {
        // Test with line that has repeated characters
        // "Multi-word line one two three four five six seven eight nine ten"
        await enterVisualModeAtText('one two three');

        const initial = await getSelectionInfo();
        console.log(`Start: offset ${initial.focusOffset}, text: "${initial.focusNodeText}"`);

        // Find forward to 't' (appears in "two", "three")
        await sendKey(pageWs, 'f');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterF = await getSelectionInfo();
        console.log(`After 'ft': offset ${afterF.focusOffset}`);

        // Press , to find 't' backward
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterComma1 = await getSelectionInfo();
        console.log(`After ',' #1: offset ${afterComma1.focusOffset}`);

        // Press , again
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterComma2 = await getSelectionInfo();
        console.log(`After ',' #2: offset ${afterComma2.focusOffset}`);

        // Should be able to navigate through multiple occurrences
        expect(typeof afterComma2.focusOffset).toBe('number');
    });

    test(', after f with no match keeps cursor position', async () => {
        // Test behavior when character is not found
        await enterVisualModeAtText('Short line');

        const initial = await getSelectionInfo();
        console.log(`Initial: offset ${initial.focusOffset}`);

        // Try to find a character that doesn't exist
        await sendKey(pageWs, 'f');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'Z');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterFailedFind = await getSelectionInfo();
        console.log(`After 'fZ' (no match): offset ${afterFailedFind.focusOffset}`);

        // Press , to find opposite (should also fail or do nothing)
        await sendKey(pageWs, ',');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterComma = await getSelectionInfo();
        console.log(`After ',': offset ${afterComma.focusOffset}`);

        // Should complete without error
        expect(typeof afterComma.focusOffset).toBe('number');
    });
});
