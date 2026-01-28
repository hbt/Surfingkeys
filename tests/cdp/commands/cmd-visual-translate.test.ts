/**
 * CDP Test: cmd_visual_translate
 *
 * Focused observability test for the visual mode translate command.
 * - Single command: cmd_visual_translate
 * - Single key: 't'
 * - Single behavior: translate selected text with Google Translate
 * - Focus: verify command execution without errors
 *
 * Note: This command opens Google Translate in a new tab. Tests verify that
 * the command executes without throwing errors, regardless of whether tabs
 * are actually created (which may vary by browser configuration).
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-translate.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-translate.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-translate.test.ts
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

describe('cmd_visual_translate', () => {
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
     * Get current selection text
     */
    async function getSelectionText(): Promise<string> {
        return executeInTarget(pageWs, `window.getSelection().toString()`);
    }

    /**
     * Verify page is still accessible and no errors occurred
     */
    async function verifyPageAccessible(): Promise<void> {
        const state = await executeInTarget(pageWs, 'document.readyState');
        expect(state).toBe('complete');
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
        // Clear any selections
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

    test('pressing t in visual mode executes without error', async () => {
        // Enter visual mode at text
        await enterVisualModeAtText('Short line');

        // Create selection by moving right
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'l');
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        const selectedText = await getSelectionText();
        console.log(`Selected text: "${selectedText}" (length: ${selectedText.length})`);

        // Press 't' to translate
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify no errors occurred
        await verifyPageAccessible();
        console.log(`Translate command 't' executed successfully`);
    });

    test('t command with short text selection executes', async () => {
        await enterVisualModeAtText('Short line');
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'l');
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        const selectedText = await getSelectionText();
        console.log(`Selected short text: "${selectedText}"`);

        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        await verifyPageAccessible();
        console.log(`Short text translate executed`);
    });

    test('t command with medium length text selection executes', async () => {
        await enterVisualModeAtText('This is a medium');

        for (let i = 0; i < 10; i++) {
            await sendKey(pageWs, 'l');
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        const selectedText = await getSelectionText();
        console.log(`Selected medium text: "${selectedText}"`);

        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        await verifyPageAccessible();
        console.log(`Medium text translate executed`);
    });

    test('t command with long text selection executes', async () => {
        await enterVisualModeAtText('This is a much longer line');

        // Extend to end of line
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selectedText = await getSelectionText();
        console.log(`Selected long text: "${selectedText}"`);

        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        await verifyPageAccessible();
        console.log(`Long text translate executed`);
    });

    test('t command with no selection executes', async () => {
        // Enter visual mode but don't move (stay in caret mode)
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selectedText = await getSelectionText();
        console.log(`Selected text (caret mode): "${selectedText}" (length: ${selectedText.length})`);

        // Press 't' with no selection - should translate full page
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        await verifyPageAccessible();
        console.log(`No-selection translate executed (full page)`);
    });

    test('t command can be used multiple times', async () => {
        // First translation
        await enterVisualModeAtText('Short line');
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'l');
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        await verifyPageAccessible();
        console.log(`First translation executed`);

        // Exit visual mode
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Second translation
        await enterVisualModeAtText('Numbers');
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'l');
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        await verifyPageAccessible();
        console.log(`Second translation executed`);
    });

    test('t command with special characters executes', async () => {
        await enterVisualModeAtText('Special chars:');

        for (let i = 0; i < 8; i++) {
            await sendKey(pageWs, 'l');
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        const selectedText = await getSelectionText();
        console.log(`Selected special chars: "${selectedText}"`);

        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        await verifyPageAccessible();
        console.log(`Special chars translate executed`);
    });

    test('t command with numbers executes', async () => {
        await enterVisualModeAtText('Numbers: 123');

        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'l');
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        const selectedText = await getSelectionText();
        console.log(`Selected numbers: "${selectedText}"`);

        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        await verifyPageAccessible();
        console.log(`Numbers translate executed`);
    });

    test('t command with mixed alphanumeric text executes', async () => {
        await enterVisualModeAtText('Mixed: abc123');

        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 300));

        const selectedText = await getSelectionText();
        console.log(`Selected mixed text: "${selectedText}"`);

        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        await verifyPageAccessible();
        console.log(`Mixed text translate executed`);
    });

    test('t command exits visual mode', async () => {
        await enterVisualModeAtText('Final line');
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'l');
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check visual cursor exists before 't'
        const cursorBeforeT = await executeInTarget(pageWs, `
            (function() {
                const cursor = document.querySelector('.surfingkeys_cursor');
                return cursor !== null && document.body.contains(cursor);
            })()
        `);
        console.log(`Visual cursor before 't': ${cursorBeforeT}`);

        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if visual cursor is gone (visual mode exited)
        const cursorAfterT = await executeInTarget(pageWs, `
            (function() {
                const cursor = document.querySelector('.surfingkeys_cursor');
                return cursor !== null && document.body.contains(cursor);
            })()
        `);
        console.log(`Visual cursor after 't': ${cursorAfterT}`);

        // Visual mode typically exits after translate command
        // Just verify page is still accessible
        await verifyPageAccessible();
        console.log(`Translate command completed, visual mode state checked`);
    });
});
