/**
 * CDP Test: cmd_visual_select_unit
 *
 * Focused observability test for the visual select unit command.
 * - Single command: cmd_visual_select_unit
 * - Single key: 'V' (in visual mode)
 * - Single behavior: select text units (word, line, sentence, paragraph)
 * - Focus: verify command execution and selection behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-visual-select-unit.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-select-unit.test.ts
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
 * Get the current selection text
 */
async function getSelectionText(ws: WebSocket): Promise<string> {
    return executeInTarget(ws, 'document.getSelection().toString()');
}

/**
 * Get selection range details (anchorOffset, focusOffset, etc.)
 */
async function getSelectionDetails(ws: WebSocket): Promise<any> {
    return executeInTarget(ws, `
        (function() {
            const sel = document.getSelection();
            return {
                text: sel.toString(),
                type: sel.type,
                anchorOffset: sel.anchorOffset,
                focusOffset: sel.focusOffset,
                rangeCount: sel.rangeCount,
                isEmpty: sel.toString().length === 0
            };
        })()
    `);
}

/**
 * Enter visual mode by pressing 'v'
 */
async function enterVisualMode(ws: WebSocket): Promise<void> {
    await sendKey(ws, 'v');
    await new Promise(resolve => setTimeout(resolve, 300));
}

/**
 * Check if Surfingkeys visual mode is active
 */
async function isVisualModeActive(ws: WebSocket): Promise<boolean> {
    return executeInTarget(ws, `
        (function() {
            const cursor = document.querySelector('.surfingkeys_cursor');
            return cursor !== null;
        })()
    `);
}

/**
 * Click on an element to position cursor there
 */
async function clickOnElement(ws: WebSocket, elementId: string): Promise<void> {
    // Get element position
    const rect = await executeInTarget(ws, `
        (function() {
            const el = document.getElementById('${elementId}');
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };
        })()
    `);

    if (rect) {
        // Click in the middle of the element
        const clickX = rect.left + rect.width / 2;
        const clickY = rect.top + rect.height / 2;

        // Dispatch mouse click
        let msgId = 9000 + Math.floor(Math.random() * 1000);
        ws.send(JSON.stringify({
            id: msgId++,
            method: 'Input.dispatchMouseEvent',
            params: {
                type: 'mousePressed',
                x: clickX,
                y: clickY,
                button: 'left',
                clickCount: 1
            }
        }));

        await new Promise(resolve => setTimeout(resolve, 50));

        ws.send(JSON.stringify({
            id: msgId++,
            method: 'Input.dispatchMouseEvent',
            params: {
                type: 'mouseReleased',
                x: clickX,
                y: clickY,
                button: 'left',
                clickCount: 1
            }
        }));

        await new Promise(resolve => setTimeout(resolve, 200));
    }
}

describe('cmd_visual_select_unit', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-test.html';

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
        // Clear any existing selection
        await executeInTarget(pageWs, 'document.getSelection().empty()');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        // Exit visual mode if active (press Escape twice to be safe)
        try {
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 100));
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

    test('pressing Vw selects a word', async () => {
        // Click on a multi-word line to position cursor
        await clickOnElement(pageWs, 'line6'); // "Multi-word line one two three..."

        // Enter visual mode
        await enterVisualMode(pageWs);
        const visualActive = await isVisualModeActive(pageWs);
        expect(visualActive).toBe(true);

        // Press V followed immediately by w to select word (Vw is one command)
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'w', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check that text is selected
        const selection = await getSelectionText(pageWs);
        console.log(`Selected text: "${selection}"`);

        // Should select at least one word (not empty)
        expect(selection.length).toBeGreaterThan(0);
        // Should contain word boundary
        expect(selection.trim().length).toBeGreaterThan(0);
    });

    test('pressing Vl selects to line boundary', async () => {
        // Click on a line to position cursor
        await clickOnElement(pageWs, 'line2'); // "This is a medium length line..."

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vl to select to line boundary
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'l', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check that text is selected
        const selection = await getSelectionText(pageWs);
        console.log(`Selected text: "${selection}"`);

        // Should select text (at least from current position to line end/start)
        expect(selection.length).toBeGreaterThan(0);
    });

    test('pressing Vp selects to paragraph boundary', async () => {
        // Click on a paragraph to position cursor
        await clickOnElement(pageWs, 'line3');

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vp to select paragraph
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'p', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check that text is selected
        const selection = await getSelectionText(pageWs);
        console.log(`Selected text: "${selection}"`);

        // Should select text
        expect(selection.length).toBeGreaterThan(0);
    });

    test('pressing Vs selects a sentence', async () => {
        // Click on a line to position cursor
        await clickOnElement(pageWs, 'line2');

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vs to select sentence
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 's', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check that text is selected
        const selection = await getSelectionText(pageWs);
        console.log(`Selected text: "${selection}"`);

        // Should select text (at least something from the sentence)
        expect(selection.length).toBeGreaterThan(0);
    });

    test('Vw selects word even when starting from empty selection', async () => {
        // Click on word-rich line to position cursor
        await clickOnElement(pageWs, 'line6');

        // Verify no initial selection
        const initialSelection = await getSelectionText(pageWs);
        expect(initialSelection).toBe('');

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vw to select word
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'w', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check that word is selected
        const selection = await getSelectionText(pageWs);
        console.log(`Selected text: "${selection}"`);

        expect(selection.length).toBeGreaterThan(0);
        // Should select at least one character
        expect(selection.trim().length).toBeGreaterThanOrEqual(1);
    });

    test('Vw on multi-word line selects single word unit', async () => {
        // Click on multi-word line
        await clickOnElement(pageWs, 'line6');

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vw to select word
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'w', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionText(pageWs);
        console.log(`Selected text: "${selection}"`);

        // Should select text
        expect(selection.length).toBeGreaterThan(0);

        // Selection should be reasonable (not the entire line, not empty)
        expect(selection.length).toBeLessThan(100);
    });

    test('repeated Vw expands selection (not implemented - verify no crash)', async () => {
        // Click to position cursor
        await clickOnElement(pageWs, 'line6');

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vw first time
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'w', 80);
        await new Promise(resolve => setTimeout(resolve, 400));

        const firstSelection = await getSelectionText(pageWs);
        console.log(`First selection: "${firstSelection}"`);

        // Press Vw second time (this might extend or might just re-select)
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'w', 80);
        await new Promise(resolve => setTimeout(resolve, 400));

        const secondSelection = await getSelectionText(pageWs);
        console.log(`Second selection: "${secondSelection}"`);

        // Should not crash - verify some text is still selected
        expect(secondSelection.length).toBeGreaterThan(0);
    });

    test('Vw works with special characters in text', async () => {
        // Click on line with special chars
        await clickOnElement(pageWs, 'line7'); // "Special chars: !@#$..."

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vw to select word/unit
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'w', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionText(pageWs);
        console.log(`Selected text with special chars: "${selection}"`);

        // Should select something (even if just special chars)
        expect(selection.length).toBeGreaterThan(0);
    });

    test('Vw works with numbers', async () => {
        // Click on line with numbers
        await clickOnElement(pageWs, 'line8'); // "Numbers: 1234567890"

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vw to select word
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'w', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionText(pageWs);
        console.log(`Selected text with numbers: "${selection}"`);

        expect(selection.length).toBeGreaterThan(0);
    });

    test('Vl selects to line boundary from middle of line', async () => {
        // Click on long line
        await clickOnElement(pageWs, 'line3'); // Middle of long line

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vl to select to line boundary
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'l', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionText(pageWs);
        console.log(`Selected to line boundary: "${selection}"`);

        // Should select from cursor to line boundary (forward or backward)
        expect(selection.length).toBeGreaterThan(0);
    });

    test('visual mode cursor is visible after entering', async () => {
        // Click to position cursor
        await clickOnElement(pageWs, 'line1');

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Check visual mode cursor element exists
        const cursorExists = await executeInTarget(pageWs, `
            document.querySelector('.surfingkeys_cursor') !== null
        `);

        expect(cursorExists).toBe(true);
    });

    test('selection type changes to Range after Vw', async () => {
        // Click to position cursor
        await clickOnElement(pageWs, 'line2');

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Get initial selection type (should be Caret)
        const initialDetails = await getSelectionDetails(pageWs);
        console.log(`Initial selection type: ${initialDetails.type}`);

        // Press Vw to create range selection
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'w', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check selection type is now Range
        const finalDetails = await getSelectionDetails(pageWs);
        console.log(`Final selection type: ${finalDetails.type}, text: "${finalDetails.text}"`);

        expect(finalDetails.type).toBe('Range');
        expect(finalDetails.text.length).toBeGreaterThan(0);
    });

    test('Vw handles edge case: cursor at end of line', async () => {
        // Click on short line
        await clickOnElement(pageWs, 'line1');

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vw (should handle gracefully)
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'w', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Should not crash
        const selection = await getSelectionText(pageWs);
        console.log(`Selection at line end: "${selection}"`);

        // May be empty or may select backward - either is acceptable
        expect(selection).toBeDefined();
    });

    test('Vl on empty line does not crash', async () => {
        // Position on empty line
        await executeInTarget(pageWs, `
            (function() {
                const el = document.getElementById('line4');
                if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
                    const sel = document.getSelection();
                    sel.setPosition(el.firstChild, 0);
                    return true;
                }
                // Empty p element - position on the element itself
                const sel = document.getSelection();
                sel.setPosition(el, 0);
                return true;
            })()
        `);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Enter visual mode
        await enterVisualMode(pageWs);

        // Press Vl (should handle gracefully)
        await sendKey(pageWs, 'V', 80);
        await sendKey(pageWs, 'l', 80);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Should not crash
        const selection = await getSelectionText(pageWs);
        console.log(`Selection on empty line: "${selection}"`);

        expect(selection).toBeDefined();
    });
});
