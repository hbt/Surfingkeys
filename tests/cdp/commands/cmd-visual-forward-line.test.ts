/**
 * CDP Test: cmd_visual_forward_line
 *
 * Focused observability test for the visual mode forward line command.
 * - Single command: cmd_visual_forward_line
 * - Single key: 'j'
 * - Single behavior: move cursor forward by one line in visual mode
 * - Focus: verify command execution and line movement
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-forward-line.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-forward-line.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-forward-line.test.ts
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

describe('cmd_visual_forward_line', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-lines-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

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
        // Reset page state
        await executeInTarget(pageWs, `
            window.getSelection().removeAllRanges();
            window.scrollTo(0, 0);
        `);
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

    test('pressing j in visual mode moves cursor forward', async () => {
        // Enter visual mode using 'v' (will use hints to select start position)
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get initial line (wherever hints placed us)
        const initialLine = await getCurrentLineNumber();
        console.log(`Initial line after entering visual mode: ${initialLine}`);
        expect(initialLine).toBeTruthy();

        // Press j to move forward one line
        await sendKey(pageWs, 'j');
        await new Promise(resolve => setTimeout(resolve, 300));

        const finalLine = await getCurrentLineNumber();
        console.log(`After j: line ${initialLine} → ${finalLine}`);

        // Verify cursor moved forward (to a different line)
        expect(finalLine).toBeTruthy();
        expect(finalLine).not.toBe(initialLine);
    });

    test('pressing j multiple times moves forward progressively', async () => {
        // Enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 500));

        const startLine = await getCurrentLineNumber();
        console.log(`Start line: ${startLine}`);

        // Press j once
        await sendKey(pageWs, 'j');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterFirstJ = await getCurrentLineNumber();
        console.log(`After 1st j: ${afterFirstJ}`);

        // Press j again
        await sendKey(pageWs, 'j');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSecondJ = await getCurrentLineNumber();
        console.log(`After 2nd j: ${afterSecondJ}`);

        // Press j a third time
        await sendKey(pageWs, 'j');
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterThirdJ = await getCurrentLineNumber();
        console.log(`After 3rd j: ${afterThirdJ}`);

        // Verify each press moved forward
        expect(afterFirstJ).toBeTruthy();
        expect(afterSecondJ).toBeTruthy();
        expect(afterThirdJ).toBeTruthy();

        // Each line should be different from the previous
        expect(afterFirstJ).not.toBe(startLine);
        expect(afterSecondJ).not.toBe(afterFirstJ);
        expect(afterThirdJ).not.toBe(afterSecondJ);
    });

    test('visual mode command executes without errors', async () => {
        // Enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify we entered visual mode successfully
        const line = await getCurrentLineNumber();
        expect(line).toBeTruthy();

        // Press j several times
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'j');
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Verify we can still query position (no crash)
        const finalLine = await getCurrentLineNumber();
        expect(finalLine).toBeTruthy();
        expect(finalLine).not.toBe(line);

        console.log(`Successfully moved from line ${line} to ${finalLine} with 5x j`);
    });
});
