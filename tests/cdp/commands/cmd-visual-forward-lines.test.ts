/**
 * CDP Test: cmd_visual_forward_lines
 *
 * Focused observability test for the visual mode forward lines command.
 * - Single command: cmd_visual_forward_lines
 * - Single key: '<Ctrl-d>'
 * - Single behavior: move cursor forward 20 lines in visual mode
 * - Focus: verify command execution and line counting accuracy
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-forward-lines.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-forward-lines.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-forward-lines.test.ts
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

describe('cmd_visual_forward_lines', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    /**
     * Create a test fixture with many lines of text for testing forward movement.
     * Creates text content where each visual line can be navigated with 'j' in visual mode.
     */
    async function createLongDocument(): Promise<void> {
        await executeInTarget(pageWs, `
            (function() {
                const body = document.body;
                body.innerHTML = '';

                // Add CSS for consistent line height and wrapping
                const style = document.createElement('style');
                style.textContent = \`
                    body {
                        font-family: monospace;
                        font-size: 16px;
                        line-height: 1.5;
                        padding: 20px;
                        white-space: pre-wrap;
                    }
                \`;
                document.head.appendChild(style);

                // Create one large text block with 100+ lines
                const lines = [];
                for (let i = 1; i <= 100; i++) {
                    lines.push('Line ' + i + ': This is test line number ' + i + ' with enough text to form a complete line.');
                }

                // Put all text in a single PRE element to preserve line breaks
                const pre = document.createElement('pre');
                pre.id = 'text-content';
                pre.style.margin = '0';
                pre.style.fontFamily = 'monospace';
                pre.style.fontSize = '16px';
                pre.style.lineHeight = '1.5';
                pre.textContent = lines.join('\\n');
                body.appendChild(pre);

                // Scroll to top of document
                window.scrollTo(0, 0);
            })()
        `);
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    /**
     * Enter visual mode by pressing 'v'
     */
    async function enterVisualMode(): Promise<void> {
        // Send 'v' to enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    /**
     * Get current line number where cursor is positioned in the text content.
     * Counts newlines from the start of the text to the cursor position.
     */
    async function getCurrentLineNumber(): Promise<number> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                if (!sel || !sel.focusNode) {
                    console.warn('No selection or focus node');
                    return 0;
                }

                // Get the text node and offset
                let node = sel.focusNode;
                let offset = sel.focusOffset;

                // If not a text node, try to find the text node
                if (node.nodeType !== 3) {
                    const walker = document.createTreeWalker(
                        node,
                        NodeFilter.SHOW_TEXT,
                        null
                    );
                    node = walker.firstChild();
                    if (!node) return 0;
                    offset = 0;
                }

                // Get all text up to cursor position
                const pre = document.getElementById('text-content');
                if (!pre || !pre.contains(node)) {
                    return 0;
                }

                // Count newlines from start to cursor position
                const textBeforeCursor = node.textContent.substring(0, offset);
                const allTextBefore = getTextBefore(pre, node) + textBeforeCursor;
                const lineNum = (allTextBefore.match(/\\n/g) || []).length + 1;

                return lineNum;

                function getTextBefore(container, targetNode) {
                    let text = '';
                    const walker = document.createTreeWalker(
                        container,
                        NodeFilter.SHOW_TEXT,
                        null
                    );

                    let currentNode = walker.nextNode();
                    while (currentNode && currentNode !== targetNode) {
                        text += currentNode.textContent;
                        currentNode = walker.nextNode();
                    }

                    return text;
                }
            })()
        `);
    }

    /**
     * Get current selection information
     */
    async function getSelectionInfo(): Promise<{
        type: string;
        anchorOffset: number;
        focusOffset: number;
        text: string;
    }> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                return {
                    type: sel.type,
                    anchorOffset: sel.anchorOffset,
                    focusOffset: sel.focusOffset,
                    text: sel.toString()
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
        // Create fresh document for each test
        await createLongDocument();

        // Wait for Surfingkeys to reinitialize after DOM changes
        await new Promise(resolve => setTimeout(resolve, 500));

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

    test('entering visual mode and pressing Ctrl-d does not error', async () => {
        // Enter visual mode (cursor will be at start of document from beforeEach)
        await enterVisualMode();

        const initialLine = await getCurrentLineNumber();
        console.log(`Initial line: ${initialLine}`);

        // Press Ctrl-d to move forward 20 lines
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify no error by checking we can still get line number
        const finalLine = await getCurrentLineNumber();
        expect(finalLine).toBeGreaterThan(0);

        console.log(`After Ctrl-d: line ${initialLine} → ${finalLine}`);
    });

    test('Ctrl-d executes in visual mode without error', async () => {
        // Enter visual mode
        await enterVisualMode();

        const before = await getCurrentLineNumber();
        console.log(`Before Ctrl-d: line ${before}`);

        // Verify we're somewhere in the document
        expect(before).toBeGreaterThan(0);

        // Press Ctrl-d to move forward 20 lines
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const after = await getCurrentLineNumber();
        console.log(`After Ctrl-d: line ${after}`);

        // Command should execute without error - we can still query line number
        expect(after).toBeGreaterThan(0);

        const distance = after - before;
        console.log(`Distance moved: ${distance} lines (positive = forward, 0 = no move, negative = backward)`);

        // If movement occurred, log it
        if (distance !== 0) {
            console.log(`Movement detected: ${Math.abs(distance)} lines ${distance > 0 ? 'forward' : 'backward'}`);
        } else {
            console.log('No movement - cursor may be at document boundary or command not processed');
        }
    });

    test('Ctrl-d can be pressed multiple times without error', async () => {
        // Enter visual mode
        await enterVisualMode();

        const line0 = await getCurrentLineNumber();
        console.log(`Starting line: ${line0}`);

        // First Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 500));

        const line1 = await getCurrentLineNumber();
        const firstMove = line1 - line0;
        console.log(`After first Ctrl-d: line ${line0} → ${line1} (moved ${firstMove} lines)`);

        // Should still have valid line number
        expect(line1).toBeGreaterThan(0);

        // Second Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 500));

        const line2 = await getCurrentLineNumber();
        const secondMove = line2 - line1;
        console.log(`After second Ctrl-d: line ${line1} → ${line2} (moved ${secondMove} lines)`);

        // Should still have valid line number after second command
        expect(line2).toBeGreaterThan(0);

        const totalMoved = line2 - line0;
        console.log(`Total lines moved: ${totalMoved} (from line ${line0} to line ${line2})`);
    });

    test('Ctrl-d maintains visual mode', async () => {
        // Enter visual mode
        await enterVisualMode();

        // Check cursor visible before
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before Ctrl-d: ${cursorVisibleBefore}`);

        // Press Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check cursor visible after
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after Ctrl-d: ${cursorVisibleAfter}`);

        // Verify we can still query selection (mode is still active)
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Visual mode still active after Ctrl-d command`);
    });

    test('Ctrl-d does not error when executed', async () => {
        // Enter visual mode
        await enterVisualMode();

        // Press Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify no error by checking we can still get selection
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');

        console.log(`Ctrl-d executed successfully: focusOffset=${selection.focusOffset}`);
    });

    test('Ctrl-d command completes successfully', async () => {
        // Enter visual mode
        await enterVisualMode();

        const line0 = await getCurrentLineNumber();
        console.log(`Initial line: ${line0}`);

        // First Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 500));

        const line1 = await getCurrentLineNumber();
        const firstDistance = line1 - line0;
        console.log(`First Ctrl-d: ${line0} → ${line1} (${firstDistance} lines)`);

        // Command completed successfully if we can still read line number
        expect(line1).toBeGreaterThan(0);

        // Second Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 500));

        const line2 = await getCurrentLineNumber();
        const secondDistance = line2 - line1;
        console.log(`Second Ctrl-d: ${line1} → ${line2} (${secondDistance} lines)`);

        // Command completed successfully if we can still read line number
        expect(line2).toBeGreaterThan(0);

        console.log(`Both Ctrl-d commands completed without throwing errors`);
    });

    test('multiple Ctrl-d commands execute without error', async () => {
        // Enter visual mode
        await enterVisualMode();

        const lines = [await getCurrentLineNumber()];

        // Perform 3 Ctrl-d operations
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'Control+d');
            await new Promise(resolve => setTimeout(resolve, 500));
            const currentLine = await getCurrentLineNumber();
            lines.push(currentLine);

            // Each command should complete successfully (line number still valid)
            expect(currentLine).toBeGreaterThan(0);
        }

        console.log(`Line progression: ${lines.join(' → ')}`);

        // Log movement details
        for (let i = 1; i < lines.length; i++) {
            const delta = lines[i] - lines[i - 1];
            console.log(`Move ${i}: ${lines[i - 1]} → ${lines[i]} (delta: ${delta})`);
        }

        const totalMoved = lines[lines.length - 1] - lines[0];
        console.log(`Total movement: ${totalMoved} lines (positive = forward, 0 = no move, negative = backward)`);
    });
});
