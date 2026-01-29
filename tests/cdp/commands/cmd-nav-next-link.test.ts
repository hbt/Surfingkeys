/**
 * CDP Test: cmd_nav_next_link
 *
 * Focused observability test for the next link navigation command.
 * - Single command: cmd_nav_next_link
 * - Single key: ']]'
 * - Single behavior: click "next" link on page and navigate
 * - Focus: verify command execution and navigation behavior using CDP events
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-nav-next-link.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-nav-next-link.test.ts
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
    waitForSurfingkeysReady,
    getPageURL
} from '../utils/browser-actions';
import { waitForCDPEvent } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Wait for navigation to complete by listening for Page.frameNavigated events
 */
async function waitForNavigation(
    ws: WebSocket,
    timeoutMs: number = 5000
): Promise<string> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.removeListener('message', handler);
            reject(new Error(`Navigation timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        const handler = (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.method === 'Page.frameNavigated') {
                    const url = msg.params?.frame?.url;
                    if (url) {
                        clearTimeout(timeout);
                        ws.removeListener('message', handler);
                        resolve(url);
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        };

        ws.on('message', handler);
    });
}

/**
 * Wait for a click event on a specific element
 */
async function waitForClickEvent(
    ws: WebSocket,
    elementId: string,
    timeoutMs: number = 5000
): Promise<boolean> {
    const signalMarker = `__CLICK_EVENT_${Date.now()}_${Math.random()}__`;

    // Inject click listener
    const listenerCode = `
        (async () => {
            return new Promise((resolve) => {
                const elem = document.getElementById('${elementId}');
                if (!elem) {
                    console.log('${signalMarker}:NOT_FOUND');
                    resolve(false);
                    return;
                }

                const listener = (e) => {
                    elem.removeEventListener('click', listener);
                    console.log('${signalMarker}:CLICKED');
                    resolve(true);
                };

                elem.addEventListener('click', listener, { once: true });

                setTimeout(() => {
                    elem.removeEventListener('click', listener);
                    console.log('${signalMarker}:TIMEOUT');
                    resolve(false);
                }, ${timeoutMs});
            });
        })()
    `;

    const signalPromise = waitForCDPEvent(
        ws,
        (msg) => {
            if (msg.method !== 'Runtime.consoleAPICalled') return false;
            const args = msg.params?.args;
            if (!Array.isArray(args) || args.length === 0) return false;
            const value = args[0]?.value;
            return value && value.includes(signalMarker);
        },
        timeoutMs + 1000
    );

    try {
        await executeInTarget(ws, listenerCode, timeoutMs + 2000);
    } catch (e) {
        // Listener is running
    }

    const signal = await signalPromise;
    const value = signal.params?.args?.[0]?.value || '';
    return value.includes(':CLICKED');
}

describe('cmd_nav_next_link', () => {
    const BASE_URL = 'http://127.0.0.1:9873';
    const FIXTURE_URL = `${BASE_URL}/next-link-test.html`;
    const EXPECTED_PAGE2_URL = `${BASE_URL}/page2.html`;

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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/next-link-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Enable Page domain for navigation events
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Page.enable'
        }));

        // Enable Runtime domain for console logging
        pageWs.send(JSON.stringify({
            id: 1000,
            method: 'Runtime.enable'
        }));

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Navigate back to fixture page before each test
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabId}, { url: '${FIXTURE_URL}' }, () => {
                    resolve(true);
                });
            })
        `);

        // Wait for navigation to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Reconnect to the page after navigation
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }

        const pageWsUrl = await findContentPage('127.0.0.1:9873/next-link-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Page.enable' }));
        pageWs.send(JSON.stringify({ id: 1000, method: 'Runtime.enable' }));
        await waitForSurfingkeysReady(pageWs);

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

    test('pressing ]] clicks the next link', async () => {
        // Verify we're on the fixture page
        const initialUrl = await getPageURL(pageWs);
        expect(initialUrl).toContain('next-link-test.html');

        // Verify next link exists
        const nextLinkExists = await executeInTarget(pageWs, `
            document.getElementById('next-link') !== null
        `);
        expect(nextLinkExists).toBe(true);

        // Set up click listener before sending key
        const clickPromise = waitForClickEvent(pageWs, 'next-link', 5000);

        // Send ]] key sequence
        await sendKey(pageWs, ']', 50);
        await sendKey(pageWs, ']', 50);

        // Wait for click event
        const clicked = await clickPromise;
        expect(clicked).toBe(true);

        console.log('Next link was clicked successfully');
    });

    test('pressing ]] navigates to page2.html', async () => {
        // Verify initial URL
        const initialUrl = await getPageURL(pageWs);
        expect(initialUrl).toContain('next-link-test.html');

        // Set up navigation listener BEFORE sending key
        const navPromise = waitForNavigation(pageWs, 8000);

        // Send ]] key sequence
        await sendKey(pageWs, ']', 50);
        await sendKey(pageWs, ']', 50);

        // Wait for navigation to complete
        const finalUrl = await navPromise;

        console.log(`Navigated from ${initialUrl} to ${finalUrl}`);

        // Verify we navigated to page2.html
        expect(finalUrl).toContain('page2.html');
    });

    test('finds next link with rel="next" attribute', async () => {
        // Navigate to rel="next" test page
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabId}, { url: '${BASE_URL}/next-link-rel-test.html' }, () => {
                    resolve(true);
                });
            })
        `);

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Reconnect to the new page
        await closeCDP(pageWs);
        const pageWsUrl = await findContentPage('127.0.0.1:9873/next-link-rel-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Page.enable' }));
        pageWs.send(JSON.stringify({ id: 1000, method: 'Runtime.enable' }));
        await waitForSurfingkeysReady(pageWs);

        // Verify we're on the rel test page
        const url = await getPageURL(pageWs);
        expect(url).toContain('next-link-rel-test.html');

        // Set up click listener for semantic next link
        const clickPromise = waitForClickEvent(pageWs, 'semantic-next', 5000);

        // Send ]] key sequence
        await sendKey(pageWs, ']', 50);
        await sendKey(pageWs, ']', 50);

        // Wait for click
        const clicked = await clickPromise;
        expect(clicked).toBe(true);

        console.log('Semantic rel="next" link was clicked successfully');
    });

    test('finds next link with >> symbol', async () => {
        // Navigate to symbols test page
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabId}, { url: '${BASE_URL}/next-link-symbols-test.html' }, () => {
                    resolve(true);
                });
            })
        `);

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Reconnect to the new page
        await closeCDP(pageWs);
        const pageWsUrl = await findContentPage('127.0.0.1:9873/next-link-symbols-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({ id: 999, method: 'Page.enable' }));
        pageWs.send(JSON.stringify({ id: 1000, method: 'Runtime.enable' }));
        await waitForSurfingkeysReady(pageWs);

        // Verify we're on the symbols test page
        const url = await getPageURL(pageWs);
        expect(url).toContain('next-link-symbols-test.html');

        // Set up click listener for symbol next link
        const clickPromise = waitForClickEvent(pageWs, 'next-symbol', 5000);

        // Send ]] key sequence
        await sendKey(pageWs, ']', 50);
        await sendKey(pageWs, ']', 50);

        // Wait for click
        const clicked = await clickPromise;
        expect(clicked).toBe(true);

        console.log('Symbol >> next link was clicked successfully');
    });

    test('no navigation occurs when no next link is present', async () => {
        // Create a page with no next link
        await executeInTarget(pageWs, `
            document.body.innerHTML = '<h1>No Next Link Page</h1><p>This page has no next link.</p>';
        `);

        // Wait for DOM to settle
        await new Promise(resolve => setTimeout(resolve, 200));

        // Get initial URL
        const initialUrl = await getPageURL(pageWs);
        expect(initialUrl).toContain('next-link-test.html');

        // Send ]] key sequence
        await sendKey(pageWs, ']', 50);
        await sendKey(pageWs, ']', 50);

        // Wait a bit to ensure no navigation happens
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify URL hasn't changed
        const finalUrl = await getPageURL(pageWs);
        expect(finalUrl).toBe(initialUrl);

        console.log('No navigation occurred when next link was absent (expected behavior)');
    });
});
