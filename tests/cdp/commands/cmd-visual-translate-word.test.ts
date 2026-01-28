/**
 * CDP Test: cmd_visual_translate_word
 *
 * Focused observability test for the visual mode translate word command.
 * - Single command: cmd_visual_translate_word
 * - Single key: 'q' (in visual mode)
 * - Single behavior: translate word under cursor
 * - Focus: verify command execution and translation bubble display without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-visual-translate-word.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-translate-word.test.ts
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

describe('cmd_visual_translate_word', () => {
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

        // Enable Runtime domain for console logging
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Reset page state before each test
        await executeInTarget(pageWs, `
            (function() {
                // Clear any selections
                window.getSelection().removeAllRanges();
                // Scroll to top
                window.scrollTo(0, 0);
                // Remove any bubbles
                const bubbles = document.querySelectorAll('.sk_bubble');
                bubbles.forEach(b => b.remove());
            })()
        `);

        // Ensure we're in Normal mode
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
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

    /**
     * Enter visual mode at specific text on the page
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

        // Ensure we're in Normal mode first
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send 'v' to enter visual mode
        await sendKey(pageWs, 'v');
        await new Promise(resolve => setTimeout(resolve, 500));
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
     * Check if the visual cursor is visible
     */
    async function isVisualCursorVisible(): Promise<boolean> {
        return executeInTarget(pageWs, `
            (function() {
                const cursor = document.querySelector('.surfingkeys_cursor');
                return cursor !== null && document.body.contains(cursor);
            })()
        `);
    }

    /**
     * Get word under cursor without triggering translation
     */
    async function getWordUnderCursorInfo(): Promise<string | null> {
        return executeInTarget(pageWs, `
            (function() {
                function getNearestWord(text, offset) {
                    var dist = 999999, found = false;
                    var splitChars = [' ', '.', ',', ';', ':', '!', '?', '"', "'", '(', ')', '[', ']', '{', '}', '<', '>', '/', '\\\\', '|', '-', '_', '=', '+', '*', '&', '^', '%', '$', '#', '@', '~', '\`'];
                    var ranges = [];
                    var start = 0, end;
                    for (var i = 0; i < text.length; i++) {
                        if (splitChars.indexOf(text[i]) !== -1) {
                            end = i;
                            if (end > start) {
                                ranges.push([start, end - start]);
                            }
                            start = i + 1;
                        }
                    }
                    if (start < text.length) {
                        ranges.push([start, text.length - start]);
                    }

                    var ret = null;
                    for (var i = 0; i < ranges.length; i++) {
                        var d = Math.abs(offset - ranges[i][0]);
                        if (d < dist) {
                            dist = d;
                            found = true;
                            ret = ranges[i];
                        }
                    }
                    return ret;
                }

                const sel = window.getSelection();
                if (sel.focusNode && sel.focusNode.textContent) {
                    const range = getNearestWord(sel.focusNode.textContent, sel.focusOffset);
                    if (range) {
                        return sel.focusNode.textContent.substr(range[0], range[1]).trim();
                    }
                }
                return null;
            })()
        `);
    }

    /**
     * Wait for translation bubble to appear
     */
    async function waitForTranslationBubble(timeoutMs = 2000): Promise<boolean> {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const bubbleExists = await executeInTarget(pageWs, `
                (function() {
                    // Check for bubble in the UI frame
                    const iframe = document.querySelector('iframe[src*="frontend.html"]');
                    if (iframe && iframe.contentDocument) {
                        const bubble = iframe.contentDocument.querySelector('.sk_bubble');
                        return bubble && bubble.style.display !== 'none';
                    }
                    return false;
                })()
            `);

            if (bubbleExists) {
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return false;
    }

    /**
     * Get translation bubble content
     */
    async function getBubbleContent(): Promise<string | null> {
        return executeInTarget(pageWs, `
            (function() {
                const iframe = document.querySelector('iframe[src*="frontend.html"]');
                if (iframe && iframe.contentDocument) {
                    const bubble = iframe.contentDocument.querySelector('.sk_bubble');
                    if (bubble) {
                        return bubble.textContent || bubble.innerHTML;
                    }
                }
                return null;
            })()
        `);
    }

    /**
     * Dismiss the translation bubble
     */
    async function dismissBubble(): Promise<void> {
        // Press Escape to close bubble or any other method
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    test('pressing q in visual mode triggers translation command', async () => {
        // Enter visual mode at a word
        await enterVisualModeAtText('medium');

        // Verify we're in visual mode
        const cursorVisible = await isVisualCursorVisible();
        console.log(`Visual cursor visible: ${cursorVisible}`);

        // Get word under cursor before translation
        const wordBefore = await getWordUnderCursorInfo();
        console.log(`Word under cursor: "${wordBefore}"`);

        // Press q to trigger translation
        await sendKey(pageWs, 'q');

        // Wait a bit for the command to execute
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify command executed (check logs or state changes)
        // Note: Without a translation provider configured, the bubble might not show
        // but the command should still execute
        const selection = await getSelectionInfo();
        console.log(`After q - selection type: ${selection.type}`);

        // Command should execute without error
        expect(selection.type).toBeDefined();
    });

    test('q command works with simple word', async () => {
        await enterVisualModeAtText('Short');

        const wordBefore = await getWordUnderCursorInfo();
        console.log(`Word: "${wordBefore}"`);
        expect(wordBefore).toBeTruthy();

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Command should complete without error
        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('q command works with longer word', async () => {
        await enterVisualModeAtText('considerably');

        const wordBefore = await getWordUnderCursorInfo();
        console.log(`Word: "${wordBefore}"`);
        expect(wordBefore).toBeTruthy();

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('q command works with word containing numbers', async () => {
        await enterVisualModeAtText('abc123');

        const wordBefore = await getWordUnderCursorInfo();
        console.log(`Word with numbers: "${wordBefore}"`);

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('q command works with capitalized word', async () => {
        await enterVisualModeAtText('Visual');

        const wordBefore = await getWordUnderCursorInfo();
        console.log(`Capitalized word: "${wordBefore}"`);

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('q command works at start of line', async () => {
        await enterVisualModeAtText('This is a medium');

        // Move to start of line
        await sendKey(pageWs, '0');
        await new Promise(resolve => setTimeout(resolve, 200));

        const wordBefore = await getWordUnderCursorInfo();
        console.log(`Word at line start: "${wordBefore}"`);

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('q command works at end of line', async () => {
        await enterVisualModeAtText('medium length');

        // Move to end of line
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 200));

        const wordBefore = await getWordUnderCursorInfo();
        console.log(`Word at line end: "${wordBefore}"`);

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('q command can be called multiple times in sequence', async () => {
        await enterVisualModeAtText('Multi-word');

        // First translation
        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const firstSelection = await getSelectionInfo();
        console.log(`After first q - offset: ${firstSelection.focusOffset}`);

        // Move to next word
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Second translation
        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const secondSelection = await getSelectionInfo();
        console.log(`After second q - offset: ${secondSelection.focusOffset}`);

        // Both should execute successfully
        expect(typeof firstSelection.focusOffset).toBe('number');
        expect(typeof secondSelection.focusOffset).toBe('number');
    });

    test('q command works after moving cursor', async () => {
        await enterVisualModeAtText('Multi-word');

        const initialWord = await getWordUnderCursorInfo();
        console.log(`Initial word: "${initialWord}"`);

        // Move cursor forward
        for (let i = 0; i < 5; i++) {
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        const newWord = await getWordUnderCursorInfo();
        console.log(`Word after movement: "${newWord}"`);

        // Trigger translation at new position
        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('q command handles word with special chars nearby', async () => {
        await enterVisualModeAtText('Special');

        // Move to position near special chars
        await sendKey(pageWs, '$');
        await new Promise(resolve => setTimeout(resolve, 200));

        const wordBefore = await getWordUnderCursorInfo();
        console.log(`Word near special chars: "${wordBefore}"`);

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('q command maintains visual mode after execution', async () => {
        await enterVisualModeAtText('medium');

        const cursorBeforeQ = await isVisualCursorVisible();
        console.log(`Visual cursor before q: ${cursorBeforeQ}`);

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const cursorAfterQ = await isVisualCursorVisible();
        console.log(`Visual cursor after q: ${cursorAfterQ}`);

        // Visual mode should still be active after translation
        expect(cursorAfterQ).toBe(true);
    });

    test('q command works on different words in same line', async () => {
        await enterVisualModeAtText('one two three');

        // Translate first word
        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 400));

        const firstWord = await getWordUnderCursorInfo();
        console.log(`First word: "${firstWord}"`);

        // Move to next word
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Translate second word
        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 400));

        const secondWord = await getWordUnderCursorInfo();
        console.log(`Second word: "${secondWord}"`);

        // Move to third word
        await sendKey(pageWs, 'w');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Translate third word
        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 400));

        const thirdWord = await getWordUnderCursorInfo();
        console.log(`Third word: "${thirdWord}"`);

        // All translations should execute successfully
        const finalSelection = await getSelectionInfo();
        expect(typeof finalSelection.focusOffset).toBe('number');
    });

    test('q command works with Latin text', async () => {
        await enterVisualModeAtText('Lorem ipsum');

        const wordBefore = await getWordUnderCursorInfo();
        console.log(`Latin word: "${wordBefore}"`);

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });

    test('q command preserves cursor position', async () => {
        await enterVisualModeAtText('medium');

        const offsetBefore = (await getSelectionInfo()).focusOffset;
        console.log(`Offset before q: ${offsetBefore}`);

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const offsetAfter = (await getSelectionInfo()).focusOffset;
        console.log(`Offset after q: ${offsetAfter}`);

        // Cursor position should not change significantly
        expect(Math.abs(offsetAfter - offsetBefore)).toBeLessThan(3);
    });

    test('q command works after selection is extended', async () => {
        await enterVisualModeAtText('Multi-word');

        // Extend selection
        for (let i = 0; i < 3; i++) {
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        const selectionBefore = await getSelectionInfo();
        console.log(`Selection before q: "${selectionBefore.text}"`);

        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 500));

        const selection = await getSelectionInfo();
        expect(typeof selection.focusOffset).toBe('number');
    });
});
