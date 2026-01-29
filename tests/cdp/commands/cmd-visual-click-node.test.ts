/**
 * CDP Test: cmd_visual_click_node
 *
 * Focused observability test for the visual mode click node command.
 * - Single command: cmd_visual_click_node
 * - Single key: '<Enter>'
 * - Single behavior: click on the node under the cursor in visual mode
 * - Focus: verify command execution without errors
 *
 * Implementation notes:
 * - The command is mapped to <Enter> key in visual mode
 * - It calls clickLink(selection.focusNode.parentNode, false)
 * - The click should trigger on the parent element of the text node where the cursor is
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-click-node.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-visual-click-node.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-visual-click-node.test.ts
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

describe('cmd_visual_click_node', () => {
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
        // Find the text node containing the target text and position cursor there
        await executeInTarget(pageWs, `
            (function() {
                // Find the text node containing our target text
                function findTextNode(node, searchText) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (node.textContent.includes(searchText)) {
                            return node;
                        }
                    } else {
                        for (let child of node.childNodes) {
                            const found = findTextNode(child, searchText);
                            if (found) return found;
                        }
                    }
                    return null;
                }

                const textNode = findTextNode(document.body, '${text}');
                if (!textNode) {
                    console.warn('[enterVisualMode] Text node not found: ${text}');
                    return;
                }

                // Position the selection at the beginning of this text node
                const sel = window.getSelection();
                sel.removeAllRanges();
                const range = document.createRange();
                range.setStart(textNode, 0);
                range.setEnd(textNode, 0);  // Collapsed cursor at start
                sel.addRange(range);

                console.log('[enterVisualMode] Positioned cursor at:', {
                    focusNode: sel.focusNode ? sel.focusNode.nodeName : null,
                    focusNodeText: sel.focusNode ? sel.focusNode.textContent.substring(0, 30) : null,
                    focusOffset: sel.focusOffset,
                    parentNode: sel.focusNode && sel.focusNode.parentNode ? sel.focusNode.parentNode.nodeName : null
                });
            })()
        `);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Send 'v' to enter visual mode
        // Visual mode should pick up the cursor position we just set
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
     * Get URL hash (to detect link clicks)
     */
    async function getUrlHash(): Promise<string> {
        return executeInTarget(pageWs, 'window.location.hash');
    }

    /**
     * Clear URL hash
     */
    async function clearUrlHash(): Promise<void> {
        await executeInTarget(pageWs, 'window.location.hash = ""');
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
        // Reset page state: clear any selections and hash
        await executeInTarget(pageWs, 'window.getSelection().removeAllRanges()');
        await clearUrlHash();

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

    test('entering visual mode and pressing Enter does not error', async () => {
        // Enter visual mode at beginning of a line
        await enterVisualModeAtText('This is a medium');

        // Small delay to ensure visual mode is active
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press Enter
        await sendKey(pageWs, 'Enter');

        // Small delay for command to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no error by checking we can still query the page
        const selection = await getSelectionInfo();
        expect(typeof selection).toBe('object');

        console.log(`Visual mode Enter executed without error`);
    });

    test('pressing Enter on link text changes URL hash', async () => {
        // Enter visual mode on link text
        await enterVisualModeAtText('Click this link');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify initial hash is empty
        const initialHash = await getUrlHash();
        console.log(`Initial hash: "${initialHash}"`);

        // Press Enter to click the link
        await sendKey(pageWs, 'Enter');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if hash changed
        const newHash = await getUrlHash();
        console.log(`After Enter: hash = "${newHash}"`);

        // The link should have been clicked
        expect(newHash).toBe('#clicked-link');
    });

    test('pressing Enter on button executes button onclick', async () => {
        // Enter visual mode on button text
        await enterVisualModeAtText('Click this button');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press Enter to click button
        await sendKey(pageWs, 'Enter');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if button was clicked
        const buttonClicked = await executeInTarget(pageWs, 'window.buttonClicked === true');
        console.log(`Button clicked: ${buttonClicked}`);

        expect(buttonClicked).toBe(true);
    });

    test('Enter on nested link clicks the nested link', async () => {
        // Position on nested link
        await enterVisualModeAtText('Nested link');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Click
        await sendKey(pageWs, 'Enter');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify
        const hash = await getUrlHash();
        console.log(`Nested link hash: "${hash}"`);
        expect(hash).toBe('#nested-link');
    });

    test('Enter does not error on plain text', async () => {
        // Position on plain text (no link/button parent)
        await enterVisualModeAtText('Short line');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press Enter (may do nothing, but shouldn't error)
        await sendKey(pageWs, 'Enter');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify we can still query page
        const selection = await getSelectionInfo();
        expect(typeof selection).toBe('object');

        console.log(`Enter on plain text completed without error`);
    });
});
