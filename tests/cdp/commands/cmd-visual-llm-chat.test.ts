/**
 * CDP Test: cmd_visual_llm_chat
 *
 * Focused observability test for the visual mode LLM chat command.
 * - Single command: cmd_visual_llm_chat
 * - Single key: 'A'
 * - Single behavior: open LLM chat with selected text
 * - Focus: verify command execution and omnibar opening without errors
 *
 * Visual mode states:
 * - State 0: Not in visual mode
 * - State 1: Caret mode (cursor position, no selection)
 * - State 2: Range mode (text selected)
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-llm-chat.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-llm-chat.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-llm-chat.test.ts
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

describe('cmd_visual_llm_chat', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    /**
     * Enter visual mode (simple version - no positioning)
     */
    async function enterVisualMode(): Promise<void> {
        // Send 'v' to enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    /**
     * Get current selection information
     */
    async function getSelectionInfo(): Promise<{
        type: string;
        text: string;
        length: number;
    }> {
        return executeInTarget(pageWs, `
            (function() {
                const sel = window.getSelection();
                const text = sel.toString();
                return {
                    type: sel.type,
                    text: text,
                    length: text.length
                };
            })()
        `);
    }

    /**
     * Create a selection by entering visual mode and moving cursor
     */
    async function createSelection(moves: string[]): Promise<void> {
        await enterVisualMode();

        // Execute movements to create selection
        for (const move of moves) {
            await sendKey(pageWs, move);
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    /**
     * Check if visual mode is still active (visual cursor exists)
     */
    async function isVisualModeActive(): Promise<boolean> {
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
            // Press Escape multiple times to exit visual mode and close omnibar
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

    test('pressing A in visual mode executes without error', async () => {
        // Create selection (enters visual mode and moves)
        await createSelection(['l', 'l', 'l']);

        // Verify we're in visual mode
        const beforeVisualActive = await isVisualModeActive();
        console.log(`Before A: visual mode active = ${beforeVisualActive}`);

        // Press A to open LLM chat
        await sendKey(pageWs, 'A');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify visual mode exited (command executed successfully)
        const afterVisualActive = await isVisualModeActive();
        console.log(`After A: visual mode active = ${afterVisualActive}`);

        // A command should exit visual mode
        expect(afterVisualActive).toBe(false);

        console.log('Visual mode A command executed successfully');
    });

    test('A executes with text selection', async () => {
        // Create a selection
        await createSelection(['l', 'l', 'l', 'l', 'l']);

        const selection = await getSelectionInfo();
        console.log(`Selected text: "${selection.text}" (${selection.length} chars)`);

        // Press A to open LLM chat - should not error
        await sendKey(pageWs, 'A');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify visual mode exited
        const visualActive = await isVisualModeActive();
        expect(visualActive).toBe(false);

        console.log('A command executed with text selection');
    });

    test('A executes in caret mode without selection', async () => {
        // Enter visual mode without creating selection (caret mode)
        await enterVisualMode();
        await new Promise(resolve => setTimeout(resolve, 200));

        const selection = await getSelectionInfo();
        console.log(`Selection length in caret mode: ${selection.length}`);

        // Press A to open LLM chat - should not error even without selection
        await sendKey(pageWs, 'A');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify visual mode exited
        const visualActive = await isVisualModeActive();
        expect(visualActive).toBe(false);

        console.log('A command works in caret mode');
    });

    test('A executes with multi-character selection', async () => {
        // Create multi-character selection
        await createSelection(['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l']);

        const selection = await getSelectionInfo();
        console.log(`Multi-char selection: "${selection.text}" (${selection.length} chars)`);

        // Press A to open LLM chat
        await sendKey(pageWs, 'A');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify visual mode exited
        const visualActive = await isVisualModeActive();
        expect(visualActive).toBe(false);

        console.log('A command works with multi-character selection');
    });

    test('A executes after line end command', async () => {
        // Select to end of line using $
        await enterVisualMode();
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selection = await getSelectionInfo();
        console.log(`Line selection: "${selection.text}" (${selection.length} chars)`);

        // Press A to open LLM chat
        await sendKey(pageWs, 'A');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify visual mode exited
        const visualActive = await isVisualModeActive();
        expect(visualActive).toBe(false);

        console.log('A command works with line selection');
    });

    test('consecutive A presses execute successfully', async () => {
        // First A press
        await createSelection(['l', 'l', 'l']);
        await sendKey(pageWs, 'A');
        await new Promise(resolve => setTimeout(resolve, 400));

        // Close UI
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Second A press
        await createSelection(['l', 'l']);
        await sendKey(pageWs, 'A');
        await new Promise(resolve => setTimeout(resolve, 400));

        // Should still work - visual mode should be exited
        const visualActive = await isVisualModeActive();
        expect(visualActive).toBe(false);

        console.log('Consecutive A presses work correctly');
    });
});
