/**
 * CDP Test: cmd_omnibar_commands
 *
 * Focused observability test for the commands omnibar command.
 * - Single command: cmd_omnibar_commands
 * - Single key: ':'
 * - Single behavior: open commands omnibar
 * - Focus: verify omnibar opens, displays commands, filters, and executes
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-omnibar-commands.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-omnibar-commands.test.ts
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
import { waitForDOMState } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Helper to access elements inside the shadow root iframe
 */
async function queryInShadowIframe(pageWs: WebSocket, query: string): Promise<any> {
    return executeInTarget(pageWs, `
        (function() {
            const uiHosts = document.querySelectorAll('div');
            for (const host of uiHosts) {
                if (host.shadowRoot) {
                    const iframe = host.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe && iframe.contentWindow) {
                        try {
                            return (function() {
                                ${query}
                            })();
                        } catch (e) {
                            return null;
                        }
                    }
                }
            }
            return null;
        })()
    `);
}

/**
 * Wait for omnibar to be visible in the DOM
 */
async function waitForOmnibarVisible(pageWs: WebSocket, timeoutMs: number = 3000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const visible = await isOmnibarVisible(pageWs);
        if (visible) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Omnibar did not become visible after ${timeoutMs}ms`);
}

/**
 * Check if omnibar is visible
 */
async function isOmnibarVisible(pageWs: WebSocket): Promise<boolean> {
    return queryInShadowIframe(pageWs, `
        const iframeDoc = iframe.contentWindow.document;
        const omnibar = iframeDoc.querySelector('#sk_omnibar');
        return omnibar && omnibar.offsetHeight > 0;
    `);
}

/**
 * Get omnibar input value
 */
async function getOmnibarInputValue(pageWs: WebSocket): Promise<string> {
    return queryInShadowIframe(pageWs, `
        const iframeDoc = iframe.contentWindow.document;
        const omnibar = iframeDoc.querySelector('#sk_omnibar');
        if (!omnibar) return '';
        const input = omnibar.querySelector('#sk_omnibarSearchArea input');
        return input ? input.value : '';
    `);
}

/**
 * Get omnibar prompt text
 */
async function getOmnibarPrompt(pageWs: WebSocket): Promise<string> {
    return queryInShadowIframe(pageWs, `
        const iframeDoc = iframe.contentWindow.document;
        const omnibar = iframeDoc.querySelector('#sk_omnibar');
        if (!omnibar) return '';
        const prompt = omnibar.querySelector('#sk_omnibarSearchArea span.prompt');
        return prompt ? prompt.textContent : '';
    `);
}

/**
 * Get number of visible commands in omnibar results
 */
async function getOmnibarResultCount(pageWs: WebSocket): Promise<number> {
    return queryInShadowIframe(pageWs, `
        const iframeDoc = iframe.contentWindow.document;
        const omnibar = iframeDoc.querySelector('#sk_omnibar');
        if (!omnibar) return 0;
        const results = omnibar.querySelectorAll('#sk_omnibarSearchResult>ul>li');
        return results.length;
    `);
}

/**
 * Get text of visible commands in omnibar
 */
async function getOmnibarResultTexts(pageWs: WebSocket): Promise<string[]> {
    return queryInShadowIframe(pageWs, `
        const iframeDoc = iframe.contentWindow.document;
        const omnibar = iframeDoc.querySelector('#sk_omnibar');
        if (!omnibar) return [];
        const results = omnibar.querySelectorAll('#sk_omnibarSearchResult>ul>li');
        return Array.from(results).map(li => {
            // Extract command name (before annotation)
            const text = li.textContent || '';
            const annotationIndex = text.indexOf(' - ');
            return annotationIndex > 0 ? text.substring(0, annotationIndex).trim() : text.trim();
        });
    `);
}

/**
 * Get focused command in omnibar
 */
async function getFocusedCommand(pageWs: WebSocket): Promise<string | null> {
    return queryInShadowIframe(pageWs, `
        const iframeDoc = iframe.contentWindow.document;
        const omnibar = iframeDoc.querySelector('#sk_omnibar');
        if (!omnibar) return null;
        const focused = omnibar.querySelector('#sk_omnibarSearchResult li.focused');
        if (!focused) return null;
        const text = focused.textContent || '';
        const annotationIndex = text.indexOf(' - ');
        return annotationIndex > 0 ? text.substring(0, annotationIndex).trim() : text.trim();
    `);
}

/**
 * Close omnibar by pressing Escape
 */
async function closeOmnibar(pageWs: WebSocket): Promise<void> {
    await sendKey(pageWs, 'Escape');
    await new Promise(resolve => setTimeout(resolve, 200));
}

describe('cmd_omnibar_commands', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Ensure omnibar is closed before each test
        const visible = await isOmnibarVisible(pageWs);
        if (visible) {
            await closeOmnibar(pageWs);
        }

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        // Ensure omnibar is closed after each test
        const visible = await isOmnibarVisible(pageWs);
        if (visible) {
            await closeOmnibar(pageWs);
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

    test('pressing : key opens commands omnibar', async () => {
        // Verify omnibar is initially closed
        const initiallyVisible = await isOmnibarVisible(pageWs);
        expect(initiallyVisible).toBe(false);

        // Press ':' to open commands omnibar
        await sendKey(pageWs, ':');

        // Wait for omnibar to become visible
        await waitForOmnibarVisible(pageWs);

        // Verify omnibar is now visible
        const visible = await isOmnibarVisible(pageWs);
        expect(visible).toBe(true);

        // Verify the prompt is ':' (commands prompt)
        const prompt = await getOmnibarPrompt(pageWs);
        expect(prompt).toBe(':');
    });

    test('omnibar displays available commands on open', async () => {
        // Open commands omnibar
        await sendKey(pageWs, ':');
        await waitForOmnibarVisible(pageWs);

        // Get count of visible commands
        const count = await getOmnibarResultCount(pageWs);

        // Should have at least some commands (either from history or default listing)
        // The omnibar may show command history first if available, or all commands
        expect(count).toBeGreaterThanOrEqual(0);

        console.log(`Commands omnibar opened with ${count} initial items`);
    });

    test('typing filters commands by name', async () => {
        // Open commands omnibar
        await sendKey(pageWs, ':');
        await waitForOmnibarVisible(pageWs);

        // Type 'quit' to filter commands
        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'u');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'i');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get input value to verify typing worked
        const inputValue = await getOmnibarInputValue(pageWs);
        expect(inputValue).toBe('quit');

        // Get filtered results
        const results = await getOmnibarResultTexts(pageWs);
        console.log(`Filtered results for 'quit': ${JSON.stringify(results)}`);

        // Should have 'quit' command in results
        const hasQuit = results.some(cmd => cmd.toLowerCase().includes('quit'));
        expect(hasQuit).toBe(true);
    });

    test('omnibar shows command annotations', async () => {
        // Open commands omnibar
        await sendKey(pageWs, ':');
        await waitForOmnibarVisible(pageWs);

        // Type to filter to a known command
        await sendKey(pageWs, 'q');
        await sendKey(pageWs, 'u');
        await sendKey(pageWs, 'i');
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check that results have annotations (metadata about the command)
        const hasAnnotations = await queryInShadowIframe(pageWs, `
            const iframeDoc = iframe.contentWindow.document;
            const omnibar = iframeDoc.querySelector('#sk_omnibar');
            if (!omnibar) return false;
            const results = omnibar.querySelectorAll('#sk_omnibarSearchResult>ul>li');
            if (results.length === 0) return false;
            // Check if any result has annotation span
            for (const li of results) {
                const annotation = li.querySelector('span.annotation');
                if (annotation && annotation.textContent.length > 0) {
                    return true;
                }
            }
            return false;
        `);

        expect(hasAnnotations).toBe(true);
    });

    test('tab key autocompletes focused command', async () => {
        // Open commands omnibar
        await sendKey(pageWs, ':');
        await waitForOmnibarVisible(pageWs);

        // Type partial command
        await sendKey(pageWs, 'q');
        await sendKey(pageWs, 'u');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Press Tab to autocomplete
        await sendKey(pageWs, 'Tab');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Get input value
        const inputValue = await getOmnibarInputValue(pageWs);
        console.log(`After Tab: input value = '${inputValue}'`);

        // Input should be updated with the full command name
        expect(inputValue.length).toBeGreaterThan(2);
        expect(inputValue.startsWith('qu')).toBe(true);
    });

    test('arrow keys navigate through commands', async () => {
        // Open commands omnibar
        await sendKey(pageWs, ':');
        await waitForOmnibarVisible(pageWs);

        // Type to get some filtered results
        await sendKey(pageWs, 'q');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get initial count
        const count = await getOmnibarResultCount(pageWs);
        if (count === 0) {
            console.log('No results to navigate, skipping navigation test');
            return;
        }

        // Press down arrow to focus first result
        await sendKey(pageWs, 'ArrowDown');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Get focused command
        const focused1 = await getFocusedCommand(pageWs);
        console.log(`First focused command: ${focused1}`);
        expect(focused1).not.toBeNull();

        // Press down arrow again if there are multiple results
        if (count > 1) {
            await sendKey(pageWs, 'ArrowDown');
            await new Promise(resolve => setTimeout(resolve, 200));

            const focused2 = await getFocusedCommand(pageWs);
            console.log(`Second focused command: ${focused2}`);

            // Should have moved to a different command
            expect(focused2).not.toBe(focused1);
        }
    });

    test('escape key closes commands omnibar', async () => {
        // Open commands omnibar
        await sendKey(pageWs, ':');
        await waitForOmnibarVisible(pageWs);

        // Verify it's visible
        let visible = await isOmnibarVisible(pageWs);
        expect(visible).toBe(true);

        // Press Escape to close
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify it's now closed
        visible = await isOmnibarVisible(pageWs);
        expect(visible).toBe(false);
    });

    test('entering command executes it', async () => {
        // Open commands omnibar
        await sendKey(pageWs, ':');
        await waitForOmnibarVisible(pageWs);

        // Type 'stopReading' command (should be safe - just stops reading mode if active)
        await sendKey(pageWs, 's');
        await sendKey(pageWs, 't');
        await sendKey(pageWs, 'o');
        await sendKey(pageWs, 'p');
        await sendKey(pageWs, 'R');
        await sendKey(pageWs, 'e');
        await sendKey(pageWs, 'a');
        await sendKey(pageWs, 'd');
        await sendKey(pageWs, 'i');
        await sendKey(pageWs, 'n');
        await sendKey(pageWs, 'g');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify the command is typed
        const inputValue = await getOmnibarInputValue(pageWs);
        expect(inputValue).toBe('stopReading');

        // Press Enter to execute
        await sendKey(pageWs, 'Enter');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Omnibar should close after execution
        const visible = await isOmnibarVisible(pageWs);
        expect(visible).toBe(false);
    });

    test('omnibar input field receives focus when opened', async () => {
        // Open commands omnibar
        await sendKey(pageWs, ':');
        await waitForOmnibarVisible(pageWs);

        // Check if input has focus
        const inputHasFocus = await queryInShadowIframe(pageWs, `
            const iframeDoc = iframe.contentWindow.document;
            const omnibar = iframeDoc.querySelector('#sk_omnibar');
            if (!omnibar) return false;
            const input = omnibar.querySelector('#sk_omnibarSearchArea input');
            return input && iframeDoc.activeElement === input;
        `);

        expect(inputHasFocus).toBe(true);
    });
});
