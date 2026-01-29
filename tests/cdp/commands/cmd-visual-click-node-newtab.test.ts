/**
 * CDP Test: cmd_visual_click_node_newtab
 *
 * Focused observability test for the visual mode click in new tab command.
 * - Single command: cmd_visual_click_node_newtab
 * - Single key: '<Shift-Enter>'
 * - Single behavior: click node under cursor in new tab in visual mode
 * - Focus: verify command execution, new tab creation, visual mode functionality
 *
 * Implementation notes:
 * - The command is mapped to <Shift-Enter> key in visual mode
 * - It calls clickLink(selection.focusNode.parentNode, true) with shiftKey=true
 * - This should open the link in a new background tab
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-visual-click-node-newtab.test.ts
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

describe('cmd_visual_click_node_newtab', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    /**
     * Enter visual mode and position cursor
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
     * Get all tabs in current window
     */
    async function getAllTabs(): Promise<Array<{ id: number; url: string; active: boolean }>> {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({ currentWindow: true }, (tabs) => {
                    resolve(tabs.map(t => ({
                        id: t.id,
                        url: t.url,
                        active: t.active
                    })));
                });
            })
        `);
        return result;
    }

    /**
     * Get currently active tab
     */
    async function getActiveTab(): Promise<{ id: number; url: string }> {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    resolve(tabs[0] ? { id: tabs[0].id, url: tabs[0].url } : null);
                });
            })
        `);
        return result;
    }

    /**
     * Send Shift-Enter key combination
     */
    async function sendShiftEnter(): Promise<void> {
        // Use sendKey utility which properly handles Shift modifier
        await sendKey(pageWs, 'Shift+Enter');
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * Get URL hash
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
        // Reset page state: clear any selections
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

        // Clean up any extra tabs created during test
        const allTabs = await getAllTabs();
        for (const tab of allTabs) {
            if (tab.id !== tabId && !tab.url.startsWith('chrome://')) {
                try {
                    await closeTab(bgWs, tab.id);
                } catch (e) {
                    // Tab might already be closed
                }
            }
        }
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

    test('Shift-Enter in visual mode creates a new tab', async () => {
        // Get initial tab count
        const initialTabs = await getAllTabs();
        const initialTabCount = initialTabs.length;
        console.log(`Initial tab count: ${initialTabCount}`);

        // Enter visual mode at link text
        await enterVisualModeAtText('Click this link');

        // Small delay to ensure visual mode is ready
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press Shift-Enter
        await sendShiftEnter();

        // Wait for new tab creation
        await new Promise(resolve => setTimeout(resolve, 800));

        // Verify new tab was created
        const newTabs = await getAllTabs();
        console.log(`New tab count: ${newTabs.length}`);
        expect(newTabs.length).toBe(initialTabCount + 1);

        // Find the new tab
        const newTab = newTabs.find(t => !initialTabs.some(it => it.id === t.id));
        expect(newTab).toBeDefined();
        console.log(`New tab URL: ${newTab!.url}`);

        // Verify it has the expected URL
        expect(newTab!.url).toContain('visual-test.html');
        expect(newTab!.url).toContain('#clicked-link');
    });

    test('Shift-Enter opens tab in background (does not switch)', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab();
        console.log(`Initial active tab ID: ${initialTab.id}`);

        // Enter visual mode and click
        await enterVisualModeAtText('Click this link');
        await new Promise(resolve => setTimeout(resolve, 200));
        await sendShiftEnter();
        await new Promise(resolve => setTimeout(resolve, 800));

        // Verify we're still on the same tab
        const currentTab = await getActiveTab();
        console.log(`Current active tab ID: ${currentTab.id}`);
        expect(currentTab.id).toBe(initialTab.id);
    });

    test('regular Enter does not create new tab', async () => {
        const initialTabs = await getAllTabs();
        const initialTabCount = initialTabs.length;

        // Enter visual mode at link
        await enterVisualModeAtText('Click this link');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press regular Enter (not Shift-Enter)
        await sendKey(pageWs, 'Enter');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify no new tab was created
        const newTabs = await getAllTabs();
        expect(newTabs.length).toBe(initialTabCount);

        // Verify hash changed (navigation occurred)
        const hash = await getUrlHash();
        console.log(`Hash after Enter: ${hash}`);
        expect(hash).toBe('#clicked-link');
    });

    test('Shift-Enter works on nested link', async () => {
        const initialTabs = await getAllTabs();
        const initialTabCount = initialTabs.length;

        // Enter visual mode at nested link
        await enterVisualModeAtText('Nested link');
        await new Promise(resolve => setTimeout(resolve, 200));
        await sendShiftEnter();
        await new Promise(resolve => setTimeout(resolve, 800));

        // Verify new tab created
        const newTabs = await getAllTabs();
        expect(newTabs.length).toBe(initialTabCount + 1);

        // Verify URL
        const newTab = newTabs.find(t => !initialTabs.some(it => it.id === t.id));
        expect(newTab!.url).toContain('#nested-link');
        console.log(`Nested link opened in new tab: ${newTab!.url}`);
    });

    test('multiple Shift-Enter commands create multiple tabs', async () => {
        const initialTabs = await getAllTabs();
        const initialTabCount = initialTabs.length;

        // First click
        await enterVisualModeAtText('First');
        await new Promise(resolve => setTimeout(resolve, 200));
        await sendShiftEnter();
        await new Promise(resolve => setTimeout(resolve, 800));

        // Second click - need to clear selection and find new text
        await executeInTarget(pageWs, 'window.getSelection().removeAllRanges()');
        await new Promise(resolve => setTimeout(resolve, 200));
        await enterVisualModeAtText('Second');
        await new Promise(resolve => setTimeout(resolve, 200));
        await sendShiftEnter();
        await new Promise(resolve => setTimeout(resolve, 800));

        // Verify two new tabs created
        const newTabs = await getAllTabs();
        console.log(`Created ${newTabs.length - initialTabCount} new tabs`);
        expect(newTabs.length).toBe(initialTabCount + 2);

        // Verify both URLs exist
        const hasLink1 = newTabs.some(t => t.url.includes('#link1'));
        const hasLink2 = newTabs.some(t => t.url.includes('#link2'));
        expect(hasLink1).toBe(true);
        expect(hasLink2).toBe(true);
    });
});
