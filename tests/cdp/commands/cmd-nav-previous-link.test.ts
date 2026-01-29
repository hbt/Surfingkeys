/**
 * CDP Test: cmd_nav_previous_link
 *
 * Focused observability test for the previous link navigation command.
 * - Single command: cmd_nav_previous_link
 * - Single key: '[['
 * - Single behavior: click previous link on page
 * - Focus: verify command execution and navigation behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-nav-previous-link.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-nav-previous-link.test.ts
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
import { waitForCDPEvent } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Wait for page navigation via CDP Page domain events
 * More reliable than console-based signaling
 */
async function waitForPageNavigation(
    ws: WebSocket,
    expectedUrlPattern: string,
    timeoutMs: number = 5000
): Promise<string> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.removeListener('message', handler);
            reject(new Error(`Timeout waiting for navigation to ${expectedUrlPattern} (${timeoutMs}ms)`));
        }, timeoutMs);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());

                // Listen for Page.frameNavigated event (indicates navigation completed)
                if (msg.method === 'Page.frameNavigated') {
                    const url = msg.params?.frame?.url;
                    if (url && url.includes(expectedUrlPattern)) {
                        clearTimeout(timeout);
                        ws.removeListener('message', handler);
                        resolve(url);
                    }
                }

                // Also check Runtime.executionContextCreated (happens after navigation)
                if (msg.method === 'Runtime.executionContextCreated') {
                    // Get current URL after context created
                    executeInTarget(ws, 'window.location.href').then(url => {
                        if (url && url.includes(expectedUrlPattern)) {
                            clearTimeout(timeout);
                            ws.removeListener('message', handler);
                            resolve(url);
                        }
                    }).catch(() => {
                        // Ignore errors, keep waiting
                    });
                }
            } catch (e) {
                // Ignore parse errors, continue listening
            }
        };

        ws.on('message', handler);
    });
}

/**
 * Get current page URL
 */
async function getCurrentUrl(ws: WebSocket): Promise<string> {
    return await executeInTarget(ws, 'window.location.href');
}

describe('cmd_nav_previous_link', () => {
    const FIXTURE_PAGE2 = 'http://127.0.0.1:9873/nav-prev-link-page2.html';
    const FIXTURE_PAGE3 = 'http://127.0.0.1:9873/nav-prev-link-page3.html';

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

        // Create fixture tab - start on page 2 (which has a previous link)
        tabId = await createTab(bgWs, FIXTURE_PAGE2, true);

        // Find and connect to content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/nav-prev-link-page2.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Enable Runtime domain for console logging
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));

        // Enable Page domain for navigation events
        pageWs.send(JSON.stringify({
            id: 998,
            method: 'Page.enable'
        }));

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
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

    test('pressing [[ on page 2 navigates to page 1', async () => {
        // Navigate to page 2
        await executeInTarget(bgWs, `
            chrome.tabs.update(${tabId}, { url: '${FIXTURE_PAGE2}' })
        `);

        // Wait for navigation and reconnect
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // May already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/nav-prev-link-page2.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
        pageWs.send(JSON.stringify({ id: 998, method: 'Page.enable' }));
        await waitForSurfingkeysReady(pageWs);

        // Verify we're on page 2
        const initialUrl = await getCurrentUrl(pageWs);
        expect(initialUrl).toContain('nav-prev-link-page2.html');
        console.log(`Initial URL: ${initialUrl}`);

        // Set up navigation listener BEFORE sending keys
        const navPromise = waitForPageNavigation(pageWs, 'nav-prev-link-page1.html', 8000);

        // Send [[ keys (two '[' keys in sequence)
        await sendKey(pageWs, '[', 100);
        await sendKey(pageWs, '[', 50);

        // Wait for navigation to complete
        const finalUrl = await navPromise;
        console.log(`Final URL after [[: ${finalUrl}`);

        // Verify navigation to page 1
        expect(finalUrl).toContain('nav-prev-link-page1.html');
    });

    test('pressing [[ on page 3 navigates to page 2', async () => {
        // Navigate to page 3
        await executeInTarget(bgWs, `
            chrome.tabs.update(${tabId}, { url: '${FIXTURE_PAGE3}' })
        `);

        // Wait for navigation and reconnect
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // May already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/nav-prev-link-page3.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
        pageWs.send(JSON.stringify({ id: 998, method: 'Page.enable' }));
        await waitForSurfingkeysReady(pageWs);

        // Verify we're on page 3
        const initialUrl = await getCurrentUrl(pageWs);
        expect(initialUrl).toContain('nav-prev-link-page3.html');
        console.log(`Initial URL: ${initialUrl}`);

        // Set up navigation listener BEFORE sending keys
        const navPromise = waitForPageNavigation(pageWs, 'nav-prev-link-page2.html', 8000);

        // Send [[ keys
        await sendKey(pageWs, '[', 100);
        await sendKey(pageWs, '[', 50);

        // Wait for navigation to complete
        const finalUrl = await navPromise;
        console.log(`Final URL after [[: ${finalUrl}`);

        // Verify navigation to page 2
        expect(finalUrl).toContain('nav-prev-link-page2.html');
    });

    test('previous link detection finds rel=prev links', async () => {
        // Navigate to page 2 which has rel="prev" link
        await executeInTarget(bgWs, `
            chrome.tabs.update(${tabId}, { url: '${FIXTURE_PAGE2}' })
        `);

        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // May already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/nav-prev-link-page2.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
        await waitForSurfingkeysReady(pageWs);

        // Query for elements with rel="prev"
        const prevLinks = await executeInTarget(pageWs, `
            Array.from(document.querySelectorAll('[rel="prev"]')).map(el => ({
                tag: el.tagName,
                href: el.getAttribute('href'),
                text: el.textContent.trim()
            }))
        `);

        console.log(`Found ${prevLinks.length} rel="prev" links:`, prevLinks);

        // Should find at least one rel="prev" link
        expect(prevLinks.length).toBeGreaterThanOrEqual(1);
        expect(prevLinks.some((link: any) => link.href.includes('page1.html'))).toBe(true);
    });

    test('previous link detection matches text patterns', async () => {
        // Navigate to page 3 which has text-based previous links
        await executeInTarget(bgWs, `
            chrome.tabs.update(${tabId}, { url: '${FIXTURE_PAGE3}' })
        `);

        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // May already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/nav-prev-link-page3.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
        await waitForSurfingkeysReady(pageWs);

        // Query for clickable elements with text matching prevLinkRegex
        const textPrevLinks = await executeInTarget(pageWs, `
            // Default prevLinkRegex: /(\\b(prev|previous)\\b)|上页|上一页|前页|上頁|上一頁|前頁|<<|«/i
            const pattern = /(\\b(prev|previous)\\b)|上页|上一页|前页|上頁|上一頁|前頁|<<|«/i;

            Array.from(document.querySelectorAll('a'))
                .filter(el => {
                    const hasPointerCursor = window.getComputedStyle(el).cursor === 'pointer';
                    const hasText = pattern.test(el.textContent);
                    return hasPointerCursor && hasText;
                })
                .map(el => ({
                    text: el.textContent.trim(),
                    href: el.getAttribute('href')
                }))
        `);

        console.log(`Found ${textPrevLinks.length} text-based previous links:`, textPrevLinks);

        // Should find multiple text-based previous links
        expect(textPrevLinks.length).toBeGreaterThanOrEqual(1);

        // Verify pattern matches work
        const texts = textPrevLinks.map((link: any) => link.text.toLowerCase());
        const hasExpectedPattern = texts.some((text: string) =>
            text.includes('prev') ||
            text.includes('previous') ||
            text === '«' ||
            text === '<<'
        );
        expect(hasExpectedPattern).toBe(true);
    });
});
