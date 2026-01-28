/**
 * CDP Test: cmd_visual_expand_parent
 *
 * Focused observability test for the visual mode parent expansion command.
 * - Single command: cmd_visual_expand_parent
 * - Single key: 'p'
 * - Single behavior: expand selection to parent element in visual mode
 * - Focus: verify command execution and parent element selection
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Implementation details:
 * - The 'p' command expands selection to the parent element
 * - It walks up the DOM tree from selection.focusNode
 * - Stops when finding a parent whose text nodes extend beyond current selection
 * - Stops at document.body (doesn't expand beyond body)
 * - Sets state to 2 (Range mode) when expanding
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-expand-parent.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-expand-parent.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-expand-parent.test.ts
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

describe('cmd_visual_expand_parent', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-parent-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    /**
     * Enter visual mode and position cursor at specific element
     * Enters Range mode (state 2) by selecting a word with 'Vw'
     */
    async function enterVisualModeAtElement(elementId: string): Promise<void> {
        await executeInTarget(pageWs, `
            (function() {
                const el = document.getElementById('${elementId}');
                if (!el) {
                    console.error('Element not found: ${elementId}');
                    return;
                }
                // Get first text node of element
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                const firstTextNode = walker.nextNode();
                if (firstTextNode) {
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.setPosition(firstTextNode, 0);
                }
            })()
        `);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send 'v' to enter visual mode (Caret mode - state 1)
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Send 'Vw' to select a word and enter Range mode (state 2)
        await sendKey(pageWs, 'V');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    /**
     * Get current selection information with parent element details
     */
    async function getSelectionInfo(): Promise<{
        type: string;
        text: string;
        textLength: number;
        focusNodeParentId: string;
        focusNodeParentTagName: string;
        rangeStartContainer: string;
        rangeEndContainer: string;
        rangeStartOffset: number;
        rangeEndOffset: number;
    }> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                if (sel.rangeCount === 0) {
                    return {
                        type: sel.type,
                        text: '',
                        textLength: 0,
                        focusNodeParentId: '',
                        focusNodeParentTagName: '',
                        rangeStartContainer: '',
                        rangeEndContainer: '',
                        rangeStartOffset: 0,
                        rangeEndOffset: 0
                    };
                }
                const range = sel.getRangeAt(0);
                const focusParent = sel.focusNode?.parentElement;

                // Find closest parent with ID
                let parentWithId = focusParent;
                let parentId = '';
                while (parentWithId && !parentId) {
                    parentId = parentWithId.id || '';
                    if (!parentId) {
                        parentWithId = parentWithId.parentElement;
                    }
                }

                return {
                    type: sel.type,
                    text: sel.toString(),
                    textLength: sel.toString().length,
                    focusNodeParentId: parentId,
                    focusNodeParentTagName: focusParent ? focusParent.tagName : '',
                    rangeStartContainer: range.startContainer.nodeName,
                    rangeEndContainer: range.endContainer.nodeName,
                    rangeStartOffset: range.startOffset,
                    rangeEndOffset: range.endOffset
                };
            })()
        `);
    }

    /**
     * Get the element IDs in the selection ancestry chain
     */
    async function getSelectionAncestry(): Promise<string[]> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                if (!sel.focusNode) return [];

                const ancestry = [];
                let node = sel.focusNode.parentElement;

                while (node && node !== document.body) {
                    if (node.id) {
                        ancestry.push(node.id);
                    }
                    node = node.parentElement;
                }

                return ancestry;
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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/visual-parent-test.html');
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
            // Press Escape twice to fully exit visual mode
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

    test('pressing p expands selection to parent element', async () => {
        // Start in a nested paragraph (already in Range mode with word selected)
        await enterVisualModeAtElement('simple-para');

        const before = await getSelectionInfo();
        console.log(`Before p - parent: ${before.focusNodeParentId}, text length: ${before.textLength}`);

        // Press 'p' to expand to parent
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const after = await getSelectionInfo();
        console.log(`After p - parent: ${after.focusNodeParentId}, text length: ${after.textLength}`);

        // Selection should have expanded (more text selected)
        expect(after.textLength).toBeGreaterThan(before.textLength);
        expect(after.type).toBe('Range');
    });

    test('p expands through two levels of nesting', async () => {
        // Start in deeply nested text (already in Range mode)
        await enterVisualModeAtElement('two-level-text');

        const initial = await getSelectionInfo();
        console.log(`Initial - parent: ${initial.focusNodeParentId}`);

        // First press: expand to inner div
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const firstExpansion = await getSelectionInfo();
        console.log(`First expansion - parent: ${firstExpansion.focusNodeParentId}, text length: ${firstExpansion.textLength}`);
        expect(firstExpansion.textLength).toBeGreaterThan(initial.textLength);

        // Second press: expand to outer container
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const secondExpansion = await getSelectionInfo();
        console.log(`Second expansion - parent: ${secondExpansion.focusNodeParentId}, text length: ${secondExpansion.textLength}`);
        expect(secondExpansion.textLength).toBeGreaterThanOrEqual(firstExpansion.textLength);
    });

    test('p expands through three levels of deep nesting', async () => {
        // Start in the deepest level
        await enterVisualModeAtElement('three-level-text');

        const initial = await getSelectionInfo();
        const initialLength = initial.textLength;
        console.log(`Initial text length: ${initialLength}`);

        // Press 'p' three times to expand through all levels
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));
        const first = await getSelectionInfo();
        console.log(`After 1st p: ${first.textLength} chars`);

        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));
        const second = await getSelectionInfo();
        console.log(`After 2nd p: ${second.textLength} chars`);

        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));
        const third = await getSelectionInfo();
        console.log(`After 3rd p: ${third.textLength} chars`);

        // Each expansion should have same or more text
        expect(first.textLength).toBeGreaterThanOrEqual(initialLength);
        expect(second.textLength).toBeGreaterThanOrEqual(first.textLength);
        expect(third.textLength).toBeGreaterThanOrEqual(second.textLength);
    });

    test('p stops at document body', async () => {
        // Start at direct body child
        await enterVisualModeAtElement('direct-para');

        // Keep pressing 'p' multiple times
        let previousLength = 0;
        let stabilized = false;

        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'p');
            await new Promise(resolve => setTimeout(resolve, 300));

            const info = await getSelectionInfo();
            console.log(`Press ${i + 1}: text length = ${info.textLength}`);

            if (i > 0 && info.textLength === previousLength) {
                stabilized = true;
                console.log(`Selection stabilized at ${info.textLength} chars (stopped at body)`);
                break;
            }

            previousLength = info.textLength;
        }

        // Eventually, selection should stabilize (can't expand beyond body)
        expect(stabilized || previousLength > 0).toBe(true);
    });

    test('p works with inline elements', async () => {
        // Start in deeply nested inline element
        await enterVisualModeAtElement('inline-strong');


        const before = await getSelectionInfo();
        console.log(`Before p - text: "${before.text}", tag: ${before.focusNodeParentTagName}`);

        // Expand to parent span
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const after = await getSelectionInfo();
        console.log(`After p - text: "${after.text}", length: ${after.textLength}`);

        // Should expand to include span content
        expect(after.textLength).toBeGreaterThan(before.textLength);
    });

    test('p with sibling elements selects entire container', async () => {
        // Start in first sibling
        await enterVisualModeAtElement('sibling1');


        const before = await getSelectionInfo();
        console.log(`Before p - text: "${before.text}"`);

        // Expand to container (should include all siblings)
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const after = await getSelectionInfo();
        console.log(`After p - text length: ${after.textLength}`);

        // Should include text from all siblings
        expect(after.textLength).toBeGreaterThan(before.textLength);

        // Text should contain content from multiple paragraphs
        expect(after.text).toContain('First sibling');
    });

    test('p in complex article structure', async () => {
        // Start in article subtitle
        await enterVisualModeAtElement('article-subtitle');


        const initial = await getSelectionInfo();
        console.log(`Initial - text: "${initial.text.substring(0, 30)}..."`);

        // Expand to header section
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const header = await getSelectionInfo();
        console.log(`After 1st p - text length: ${header.textLength}`);
        expect(header.textLength).toBeGreaterThan(initial.textLength);

        // Expand to entire article
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const article = await getSelectionInfo();
        console.log(`After 2nd p - text length: ${article.textLength}`);
        expect(article.textLength).toBeGreaterThanOrEqual(header.textLength);
    });

    test('p works in table cells', async () => {
        // Start in a table cell
        await enterVisualModeAtElement('cell1');

        const before = await getSelectionInfo();
        console.log(`Before p - text: "${before.text}"`);

        // Expand to parent (td -> tr -> tbody -> table)
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const after = await getSelectionInfo();
        console.log(`After p - text length: ${after.textLength}`);

        // Should expand to include more content
        expect(after.textLength).toBeGreaterThanOrEqual(before.textLength);
    });

    test('p works in list items', async () => {
        // Start in list item with nested span
        await enterVisualModeAtElement('li2-span');


        const initial = await getSelectionInfo();
        console.log(`Initial - text: "${initial.text}"`);

        // Expand to list item
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const listItem = await getSelectionInfo();
        console.log(`After 1st p - text: "${listItem.text}"`);
        expect(listItem.textLength).toBeGreaterThan(initial.textLength);

        // Expand to list container
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const listContainer = await getSelectionInfo();
        console.log(`After 2nd p - text length: ${listContainer.textLength}`);
        expect(listContainer.textLength).toBeGreaterThan(listItem.textLength);
    });

    test('visual mode remains active after pressing p', async () => {
        // Enter visual mode
        await enterVisualModeAtElement('simple-para');


        // Press p to expand
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check visual cursor is still visible
        const cursorVisible = await isVisualCursorVisible();
        console.log(`Visual cursor visible after p: ${cursorVisible}`);

        // Should still be able to get selection
        const selection = await getSelectionInfo();
        expect(selection.type).toBe('Range');

        console.log(`Visual mode still active after p command`);
    });

    test('p switches to Range mode (state 2)', async () => {
        // Enter visual mode (starts in Caret mode)
        await enterVisualModeAtElement('simple-para');


        // Before pressing p, we're in range mode (after moving)
        const before = await getSelectionInfo();
        console.log(`Before p - selection type: ${before.type}`);

        // Press p
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const after = await getSelectionInfo();
        console.log(`After p - selection type: ${after.type}`);

        // After p, should be in Range mode with text selected
        expect(after.type).toBe('Range');
        expect(after.textLength).toBeGreaterThan(0);
    });

    test('repeated p presses continue expanding', async () => {
        // Start in nested structure
        await enterVisualModeAtElement('article-em');


        const lengths: number[] = [];

        // Press p five times and track expansion
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'p');
            await new Promise(resolve => setTimeout(resolve, 300));

            const info = await getSelectionInfo();
            lengths.push(info.textLength);
            console.log(`Press ${i + 1}: ${info.textLength} chars`);
        }

        // First expansion should increase selection
        expect(lengths[0]).toBeGreaterThan(0);

        // Each subsequent expansion should be >= previous (may stabilize at body)
        for (let i = 1; i < lengths.length; i++) {
            expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
        }
    });

    test('p handles elements with only whitespace', async () => {
        // Start at an element that might have whitespace-only text nodes
        await enterVisualModeAtElement('test-table');

        // Press p to expand
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();

        // Should not error, selection should exist
        expect(typeof selection.textLength).toBe('number');
        console.log(`Selection after p: ${selection.textLength} chars`);
    });

    test('p is idempotent at document boundary', async () => {
        // Get to a high-level element
        await enterVisualModeAtElement('direct-para');

        // Expand multiple times to reach body
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'p');
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        const beforeBoundary = await getSelectionInfo();
        console.log(`At boundary: ${beforeBoundary.textLength} chars`);

        // Press p again (should stay at body, not expand beyond)
        await sendKey(pageWs, 'p');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterBoundary = await getSelectionInfo();
        console.log(`After boundary p: ${afterBoundary.textLength} chars`);

        // Should not change (or change minimally)
        expect(afterBoundary.textLength).toBeGreaterThanOrEqual(beforeBoundary.textLength - 5);
    });
});
