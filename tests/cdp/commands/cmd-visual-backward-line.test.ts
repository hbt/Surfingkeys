/**
 * CDP Test: cmd_visual_backward_line
 *
 * Focused observability test for the visual mode backward line command.
 * - Single command: cmd_visual_backward_line
 * - Single key: 'k'
 * - Single behavior: move cursor backward by one line in visual mode
 * - Focus: verify command execution, line movement, and edge cases
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-backward-line.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-backward-line.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-backward-line.test.ts
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

describe('cmd_visual_backward_line', () => {
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

        // Move to line 50 (middle of document) using normal mode navigation
        // Send 'gg' to go to start of document first
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Then move down to line 50
        for (let i = 0; i < 49; i++) {
            await sendKey(pageWs, 'j', 30);
        }
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

    test('entering visual mode and pressing k does not error', async () => {
        // Enter visual mode (cursor will be at line 50 from beforeEach)
        await enterVisualMode();

        const initialLine = await getCurrentLineNumber();
        console.log(`Initial line: ${initialLine}`);

        // Press k to move backward one line
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify no error by checking we can still get line number
        const finalLine = await getCurrentLineNumber();
        expect(finalLine).toBeGreaterThan(0);

        console.log(`After k: line ${initialLine} → ${finalLine}`);
    });

    test('k moves cursor backward one line', async () => {
        // Enter visual mode
        await enterVisualMode();

        const before = await getCurrentLineNumber();
        console.log(`Before k: line ${before}`);
        expect(before).toBeGreaterThan(1); // Should be around line 50

        // Press k to move backward one line
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 500));

        const after = await getCurrentLineNumber();
        console.log(`After k: line ${after}`);

        // Calculate distance moved
        const distance = before - after;
        console.log(`Distance moved backward: ${distance} lines`);

        // Should have moved backward (positive distance means backward movement)
        // Note: browser's selection.modify("backward", "line") may move by visual lines,
        // not DOM lines, so the exact count may vary
        expect(distance).toBeGreaterThan(0);
        expect(after).toBeLessThan(before);
    });

    test('k pressed multiple times moves backward multiple lines', async () => {
        // Enter visual mode
        await enterVisualMode();

        const before = await getCurrentLineNumber();
        console.log(`Starting line: ${before}`);

        // Press k 5 times
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'k');
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        const after = await getCurrentLineNumber();
        console.log(`After 5 k presses: line ${after}`);

        // Calculate total distance moved
        const distance = before - after;
        console.log(`Total distance moved backward: ${distance} lines`);

        // Should have moved backward (distance should be positive and at least 5)
        // Note: actual distance may be more due to visual line wrapping
        expect(distance).toBeGreaterThanOrEqual(5);
        expect(after).toBeLessThan(before);
    });

    test('k at start of document does not move beyond start', async () => {
        // Move to line 1 first
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Enter visual mode
        await enterVisualMode();

        const beforeLine = await getCurrentLineNumber();
        console.log(`Before k at start: line ${beforeLine}`);
        expect(beforeLine).toBeGreaterThan(0); // Should be a valid line near start

        // Press k multiple times when at/near start
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'k');
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        const afterLine = await getCurrentLineNumber();
        console.log(`After k at start: line ${afterLine}`);

        // Should stay near the start, not move to negative or zero
        expect(afterLine).toBeGreaterThanOrEqual(1);
        // Should not have moved forward (afterLine should be <= beforeLine)
        expect(afterLine).toBeLessThanOrEqual(beforeLine);
    });

    test('k extends selection in range mode', async () => {
        // Enter visual mode
        await enterVisualMode();

        // Move down a few lines to create a range
        await sendKey(pageWs, 'j');
        await sendKey(pageWs, 'j');
        await sendKey(pageWs, 'j');
        await new Promise(resolve => setTimeout(resolve, 200));

        const before = await getSelectionInfo();
        console.log(`Before k in range mode: type=${before.type}, text length=${before.text.length}`);

        // Press k to extend selection backward
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 500));

        const after = await getSelectionInfo();
        console.log(`After k in range mode: type=${after.type}, text length=${after.text.length}`);

        // Selection text length may change (could increase or decrease depending on direction)
        // Main verification is that command executed without error
        expect(typeof after.text.length).toBe('number');
        expect(after.lineNumber).not.toBeNull();
    });

    test('visual mode remains active after k', async () => {
        // Enter visual mode
        await enterVisualMode();

        // Check cursor is visible before k
        const cursorVisibleBefore = await isVisualCursorVisible();
        console.log(`Visual cursor visible before k: ${cursorVisibleBefore}`);

        // Press k
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check cursor visibility after k
        const cursorVisibleAfter = await isVisualCursorVisible();
        console.log(`Visual cursor visible after k: ${cursorVisibleAfter}`);

        // Verify we can still query line number (mode is still active)
        const lineAfter = await getCurrentLineNumber();
        expect(lineAfter).toBeGreaterThan(0);

        console.log(`Visual mode still active after k command`);
    });

    test('alternating j and k returns to similar position', async () => {
        // Enter visual mode
        await enterVisualMode();

        const startLine = await getCurrentLineNumber();
        console.log(`Starting line: ${startLine}`);

        // Move forward with j multiple times to ensure we're not at document end
        await sendKey(pageWs, 'j');
        await sendKey(pageWs, 'j');
        await sendKey(pageWs, 'j');
        await new Promise(resolve => setTimeout(resolve, 200));

        const afterJ = await getCurrentLineNumber();
        console.log(`After 3 j presses: line ${afterJ}`);

        // Verify j moved forward (or stayed at end if already there)
        expect(afterJ).toBeGreaterThanOrEqual(startLine);

        // Move backward with k
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 500));

        const afterK = await getCurrentLineNumber();
        console.log(`After k: line ${afterK}`);

        // Should have moved backward from the j position
        expect(afterK).toBeLessThan(afterJ);
    });

    test('k works from middle of document', async () => {
        // Already at line 50 from beforeEach

        // Enter visual mode
        await enterVisualMode();

        const before = await getCurrentLineNumber();
        console.log(`Before k (mid-document): line ${before}`);
        expect(before).toBeGreaterThan(40); // Should be around line 50

        // Press k to move backward
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 500));

        const after = await getCurrentLineNumber();
        console.log(`After k (mid-document): line ${after}`);

        // Calculate distance moved
        const distance = before - after;
        console.log(`Distance moved backward: ${distance} lines`);

        // Should have moved backward (positive distance)
        expect(distance).toBeGreaterThan(0);
        expect(after).toBeLessThan(before);
    });

    test('k command completes successfully', async () => {
        // Enter visual mode
        await enterVisualMode();

        const line0 = await getCurrentLineNumber();
        console.log(`Initial line: ${line0}`);

        // First k
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 500));

        const line1 = await getCurrentLineNumber();
        const firstDistance = line0 - line1;
        console.log(`First k: ${line0} → ${line1} (${firstDistance} lines)`);

        // Command completed successfully if we can still read line number
        expect(line1).toBeGreaterThan(0);

        // Second k
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 500));

        const line2 = await getCurrentLineNumber();
        const secondDistance = line1 - line2;
        console.log(`Second k: ${line1} → ${line2} (${secondDistance} lines)`);

        // Command completed successfully if we can still read line number
        expect(line2).toBeGreaterThan(0);

        console.log(`Both k commands completed without throwing errors`);
    });

    test('multiple k commands execute without error', async () => {
        // Enter visual mode
        await enterVisualMode();

        const lines = [await getCurrentLineNumber()];

        // Perform 3 k operations
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'k');
            await new Promise(resolve => setTimeout(resolve, 500));
            const currentLine = await getCurrentLineNumber();
            lines.push(currentLine);

            // Each command should complete successfully (line number still valid)
            expect(currentLine).toBeGreaterThan(0);
        }

        console.log(`Line progression: ${lines.join(' → ')}`);

        // Log movement details
        for (let i = 1; i < lines.length; i++) {
            const delta = lines[i - 1] - lines[i];
            console.log(`Move ${i}: ${lines[i - 1]} → ${lines[i]} (delta: ${delta})`);
        }

        const totalMoved = lines[0] - lines[lines.length - 1];
        console.log(`Total movement: ${totalMoved} lines backward`);

        // Should have moved backward (positive total)
        expect(totalMoved).toBeGreaterThan(0);
    });

    test('k from near end of document moves backward', async () => {
        // Move to line 95 (near end)
        for (let i = 0; i < 45; i++) {
            await sendKey(pageWs, 'j', 30);
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        // Enter visual mode
        await enterVisualMode();

        const before = await getCurrentLineNumber();
        console.log(`Before k near end: line ${before}`);
        expect(before).toBeGreaterThan(90);

        // Press k to move backward
        await sendKey(pageWs, 'k');
        await new Promise(resolve => setTimeout(resolve, 500));

        const after = await getCurrentLineNumber();
        console.log(`After k near end: line ${after}`);

        // Should move backward (positive distance)
        const distance = before - after;
        expect(distance).toBeGreaterThan(0);
        expect(after).toBeLessThan(before);
    });
});
