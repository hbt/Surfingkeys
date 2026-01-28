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
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-lines-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    /**
     * Enter visual mode by pressing 'v'
     */
    async function enterVisualMode(): Promise<void> {
        // Send 'v' to enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    /**
     * Get the current line number where cursor is positioned
     */
    async function getCurrentLineNumber(): Promise<number | null> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                if (!sel.focusNode) return null;

                // Find the closest parent element with an ID starting with 'line'
                let node = sel.focusNode;
                while (node && node.nodeType !== Node.ELEMENT_NODE) {
                    node = node.parentNode;
                }

                while (node) {
                    if (node.id && node.id.startsWith('line')) {
                        const lineNum = parseInt(node.id.replace('line', ''));
                        return isNaN(lineNum) ? null : lineNum;
                    }
                    node = node.parentNode;
                }

                return null;
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
        lineNumber: number | null;
    }> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();

                // Find line number
                let lineNumber = null;
                let node = sel.focusNode;
                while (node && node.nodeType !== Node.ELEMENT_NODE) {
                    node = node.parentNode;
                }
                while (node) {
                    if (node.id && node.id.startsWith('line')) {
                        lineNumber = parseInt(node.id.replace('line', ''));
                        break;
                    }
                    node = node.parentNode;
                }

                return {
                    type: sel.type,
                    anchorOffset: sel.anchorOffset,
                    focusOffset: sel.focusOffset,
                    text: sel.toString(),
                    lineNumber: lineNumber
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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/visual-lines-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Clear any existing selections and scroll to top of document
        await executeInTarget(pageWs, `
            window.getSelection().removeAllRanges();
            window.scrollTo(0, 0);
        `);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Move to line 1 using normal mode navigation
        // Send 'gg' to go to start of document
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 200));

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

    test('Ctrl-d moves cursor forward 20 lines', async () => {
        // Move to line 10 using j commands
        for (let i = 0; i < 9; i++) {
            await sendKey(pageWs, 'j', 50);
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        // Enter visual mode
        await enterVisualMode();

        const before = await getCurrentLineNumber();
        console.log(`Before Ctrl-d: line ${before}`);
        expect(before).toBeGreaterThan(0);

        // Press Ctrl-d to move forward 20 lines
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const after = await getCurrentLineNumber();
        console.log(`After Ctrl-d: line ${after}`);

        // Calculate distance moved
        const distance = after - before;
        console.log(`Distance moved: ${distance} lines`);

        // Should have moved exactly 20 lines forward
        expect(distance).toBe(20);
    });

    test('Ctrl-d from near start moves exactly 20 lines', async () => {
        // Enter visual mode at start (from beforeEach)
        await enterVisualMode();

        const before = await getCurrentLineNumber();
        expect(before).toBeGreaterThan(0);

        // Press Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const after = await getCurrentLineNumber();

        // Calculate actual distance moved
        const distance = after - before;
        console.log(`Moved from line ${before} to line ${after} (distance: ${distance} lines)`);

        // Should move exactly 20 lines
        expect(distance).toBe(20);
    });

    test('Ctrl-d near end of document moves but stops at end', async () => {
        // Move to line 85 (near end, so 85 + 20 = 105 which exceeds 100)
        for (let i = 0; i < 84; i++) {
            await sendKey(pageWs, 'j', 30);
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        // Enter visual mode
        await enterVisualMode();

        const before = await getCurrentLineNumber();
        console.log(`Before Ctrl-d near end: line ${before}`);
        expect(before).toBeGreaterThan(80);

        // Press Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const after = await getCurrentLineNumber();
        console.log(`After Ctrl-d near end: line ${after}`);

        // Should move forward or stay at document end
        expect(after).toBeGreaterThanOrEqual(before);
        expect(after).toBeLessThanOrEqual(100);
    });

    test('Ctrl-d extends selection in range mode', async () => {
        // Move to line 15
        for (let i = 0; i < 14; i++) {
            await sendKey(pageWs, 'j', 50);
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        // Enter visual mode
        await enterVisualMode();

        // Move down a few lines to create a range
        await sendKey(pageWs, 'j');
        await sendKey(pageWs, 'j');
        await sendKey(pageWs, 'j');
        await new Promise(resolve => setTimeout(resolve, 200));

        const before = await getSelectionInfo();
        console.log(`Before Ctrl-d in range mode: type=${before.type}, text length=${before.text.length}`);

        // Press Ctrl-d to extend selection 20 more lines
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const after = await getSelectionInfo();
        console.log(`After Ctrl-d in range mode: type=${after.type}, text length=${after.text.length}`);

        // Selection should have extended (more text selected)
        expect(after.text.length).toBeGreaterThan(before.text.length);
    });

    test('visual mode remains active after Ctrl-d', async () => {
        // Move to line 20
        for (let i = 0; i < 19; i++) {
            await sendKey(pageWs, 'j', 50);
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        // Enter visual mode
        await enterVisualMode();

        // Check cursor is visible before Ctrl-d
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before Ctrl-d: ${cursorVisibleBefore}`);

        // Press Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check cursor visibility after Ctrl-d
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after Ctrl-d: ${cursorVisibleAfter}`);

        // Verify we can still query line number (mode is still active)
        const lineAfter = await getCurrentLineNumber();
        expect(lineAfter).toBeGreaterThan(0);

        console.log(`Visual mode still active after Ctrl-d command`);
    });

    test('Ctrl-d works from middle of document', async () => {
        // Move to line 30
        for (let i = 0; i < 29; i++) {
            await sendKey(pageWs, 'j', 50);
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        // Enter visual mode
        await enterVisualMode();

        const before = await getCurrentLineNumber();
        console.log(`Before Ctrl-d (mid-document): line ${before}`);
        expect(before).toBeGreaterThan(20);

        // Press Ctrl-d
        await sendKey(pageWs, 'Control+d');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const after = await getCurrentLineNumber();
        console.log(`After Ctrl-d (mid-document): line ${after}`);

        // Calculate distance moved
        const distance = after - before;
        console.log(`Distance moved: ${distance} lines`);

        // Should have moved exactly 20 lines forward
        expect(distance).toBe(20);
    });
});
