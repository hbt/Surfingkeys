/**
 * CDP Test: cmd_scroll_percentage
 *
 * Focused observability test for the scroll percentage command.
 * - Single command: cmd_scroll_percentage
 * - Single key: '%' (with numeric prefix)
 * - Single behavior: scroll to percentage
 * - Focus: verify command execution and scroll behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-percentage.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-percentage.test.ts
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
    getScrollPosition,
    enableInputDomain,
    waitForScrollChange,
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_scroll_percentage', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    beforeAll(async () => {
        // Check CDP is available
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

        // Create fixture tab
        tabId = await createTab(bgWs, FIXTURE_URL, true);

        // Find and connect to content page
        const pageWsUrl = await findContentPage(FIXTURE_URL);
        pageWs = await connectToCDP(pageWsUrl);

        enableInputDomain(pageWs);

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Reset scroll position before each test
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');

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
     * Helper: Check for confirmation message in shadow DOM
     * Looks for "Do you really want to repeat this action" message
     */
    async function fetchConfirmationMessage() {
        return executeInTarget(pageWs, `
            (function() {
                // Check main DOM first
                const mainMsg = document.body.innerText;

                // Check shadow DOM elements
                const allElements = document.querySelectorAll('*');
                for (const el of allElements) {
                    if (el.shadowRoot) {
                        const shadowText = el.shadowRoot.textContent || '';
                        if (shadowText.includes('really want to repeat')) {
                            return {
                                found: true,
                                location: 'shadowRoot',
                                text: shadowText.substring(0, 100)
                            };
                        }
                    }
                }

                if (mainMsg.includes('really want to repeat')) {
                    return {
                        found: true,
                        location: 'mainDOM',
                        text: mainMsg.substring(0, 100)
                    };
                }

                return { found: false };
            })()
        `);
    }

    test('pressing 50% scrolls to 50% of page', async () => {
        const ws = pageWs;

        const initialScroll = await getScrollPosition(ws);
        expect(initialScroll).toBe(0);

        // Get scroll height to calculate expected position
        const scrollHeight = await executeInTarget(ws, 'document.documentElement.scrollHeight');
        const expected = Math.floor(scrollHeight * 0.5);

        console.log(`[cmd_scroll_percentage 50%] Setup: scrollHeight=${scrollHeight}px, expected position=${expected}px`);

        // Send '5', '0', then '%' to trigger 50% scroll
        await sendKey(ws, '5', 200);
        console.log(`[cmd_scroll_percentage 50%] Sent key: '5'`);

        await sendKey(ws, '0', 200);
        console.log(`[cmd_scroll_percentage 50%] Sent key: '0'`);

        await sendKey(ws, '%', 200);
        console.log(`[cmd_scroll_percentage 50%] Sent key: '%'`);

        // Wait a moment for command processing
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check for confirmation message
        const confirmMsg = await fetchConfirmationMessage();
        console.log(`[cmd_scroll_percentage 50%] Confirmation message: ${JSON.stringify(confirmMsg)}`);

        // Wait for scroll to happen with timeout
        const finalScroll = await waitForScrollChange(ws, initialScroll, {
            direction: 'down',
            minDelta: 5,
            timeout: 3000
        }).catch(() => {
            console.log(`[cmd_scroll_percentage 50%] WARNING: No scroll change detected after 3s`);
            return initialScroll;
        });

        const delta = finalScroll - initialScroll;
        console.log(`[cmd_scroll_percentage 50%] Result: ${initialScroll}px → ${finalScroll}px (delta=${delta}px, expected=${expected}px, error=${Math.abs(finalScroll - expected)}px)`);

        // Verify scroll happened
        expect(finalScroll).toBeGreaterThan(initialScroll);
        // Verify scrolled to approximately 50%
        expect(Math.abs(finalScroll - expected)).toBeLessThan(50);
    });

    test('pressing 25% scrolls to 25% of page', async () => {
        const ws = pageWs;

        const initialScroll = await getScrollPosition(ws);
        expect(initialScroll).toBe(0);

        // Get scroll height to calculate expected position
        const scrollHeight = await executeInTarget(ws, 'document.documentElement.scrollHeight');
        const expected = Math.floor(scrollHeight * 0.25);

        console.log(`[cmd_scroll_percentage 25%] Setup: scrollHeight=${scrollHeight}px, expected position=${expected}px`);

        // Send '2', '5', then '%' to trigger 25% scroll
        await sendKey(ws, '2', 200);
        console.log(`[cmd_scroll_percentage 25%] Sent key: '2'`);

        await sendKey(ws, '5', 200);
        console.log(`[cmd_scroll_percentage 25%] Sent key: '5'`);

        await sendKey(ws, '%', 200);
        console.log(`[cmd_scroll_percentage 25%] Sent key: '%'`);

        // Wait a moment for command processing
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check for confirmation message
        const confirmMsg = await fetchConfirmationMessage();
        console.log(`[cmd_scroll_percentage 25%] Confirmation message: ${JSON.stringify(confirmMsg)}`);

        // Wait for scroll to happen with timeout
        const finalScroll = await waitForScrollChange(ws, initialScroll, {
            direction: 'down',
            minDelta: 5,
            timeout: 3000
        }).catch(() => {
            console.log(`[cmd_scroll_percentage 25%] WARNING: No scroll change detected after 3s`);
            return initialScroll;
        });

        const delta = finalScroll - initialScroll;
        console.log(`[cmd_scroll_percentage 25%] Result: ${initialScroll}px → ${finalScroll}px (delta=${delta}px, expected=${expected}px, error=${Math.abs(finalScroll - expected)}px)`);

        // Verify scroll happened
        expect(finalScroll).toBeGreaterThan(initialScroll);
        // Verify scrolled to approximately 25%
        expect(Math.abs(finalScroll - expected)).toBeLessThan(50);
    });
});
