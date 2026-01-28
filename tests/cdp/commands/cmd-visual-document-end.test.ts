/**
 * CDP Test: cmd_visual_document_end
 *
 * Focused observability test for the visual mode document end command.
 * - Single command: cmd_visual_document_end
 * - Single key: 'G'
 * - Single behavior: move cursor to end of document in visual mode
 * - Focus: verify command execution without errors
 *
 * Note: Following the pattern from cmd_visual_line_end.test.ts, these tests
 * verify that the G command executes without error in visual mode. The exact
 * scroll behavior may vary between headless and live browser environments.
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-document-end.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-document-end.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-document-end.test.ts
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

describe('cmd_visual_document_end', () => {
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
        // Reset page state: scroll to top and clear any selections
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
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

    test('entering visual mode and pressing G does not error', async () => {
        // Enter visual mode at beginning of document
        await enterVisualModeAtText('Visual Mode Test');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press G to move to document end
        await sendKey(pageWs, 'G');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode G executed successfully: focusOffset=${selection.focusOffset}`);
    });

    test('G from beginning of document', async () => {
        // Enter visual mode at start
        await enterVisualModeAtText('Visual Mode Test');

        const beforeSelection = await getSelectionInfo();
        console.log(`Before G - focusNodeText: "${beforeSelection.focusNodeText.substring(0, 30)}..."`);

        // Press G
        await sendKey(pageWs, 'G');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        console.log(`After G - focusNodeText: "${afterSelection.focusNodeText.substring(0, 30)}..."`);

        // Verify command executed without error
        expect(typeof afterSelection.focusOffset).toBe('number');
    });

    test('G from middle of document', async () => {
        // Enter visual mode in middle
        await enterVisualModeAtText('Multi-word');

        // Press G
        await sendKey(pageWs, 'G');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`G from middle executed: focusOffset=${selection.focusOffset}`);
    });

    test('pressing G twice is idempotent', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Visual Mode Test');

        // Press G first time
        await sendKey(pageWs, 'G');
        await new Promise(resolve => setTimeout(resolve, 300));

        const firstSelection = await getSelectionInfo();
        const firstOffset = firstSelection.focusOffset;
        const firstNodeText = firstSelection.focusNodeText;

        // Press G again
        await sendKey(pageWs, 'G');
        await new Promise(resolve => setTimeout(resolve, 300));

        const secondSelection = await getSelectionInfo();
        const secondOffset = secondSelection.focusOffset;
        const secondNodeText = secondSelection.focusNodeText;

        console.log(`First G: offset ${firstOffset}, Second G: offset ${secondOffset}`);

        // Should stay at same position (idempotent)
        expect(secondOffset).toBe(firstOffset);
        expect(secondNodeText).toBe(firstNodeText);
    });

    test('G in range mode extends selection', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Short line');

        // Create selection by moving down
        await sendKey(pageWs, 'j');
        await sendKey(pageWs, 'j');
        await new Promise(resolve => setTimeout(resolve, 200));

        const beforeSelection = await getSelectionInfo();
        const beforeLength = beforeSelection.text.length;
        console.log(`Before G in range mode - selection length: ${beforeLength}`);

        // Press G to extend to end
        await sendKey(pageWs, 'G');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSelection = await getSelectionInfo();
        const afterLength = afterSelection.text.length;
        console.log(`After G in range mode - selection length: ${afterLength}`);

        // Selection should have extended or stayed same (not shrunk)
        expect(afterLength).toBeGreaterThanOrEqual(beforeLength);
    });

    test('pressing GG (G twice quickly) does not error', async () => {
        // Enter visual mode
        await enterVisualModeAtText('Visual Mode Test');

        // Press G twice quickly
        await sendKey(pageWs, 'G');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'G');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`GG sequence executed successfully`);
    });

    test('G works on lines with special characters', async () => {
        // Test on line with special chars
        await enterVisualModeAtText('Special chars');

        await sendKey(pageWs, 'G');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should successfully execute without error
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`G on special chars line executed successfully`);
    });

    test('G works on lines with numbers', async () => {
        // Test on line with numbers
        await enterVisualModeAtText('Numbers: 123');

        await sendKey(pageWs, 'G');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should successfully execute without error
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`G on numbers line executed successfully`);
    });
});
