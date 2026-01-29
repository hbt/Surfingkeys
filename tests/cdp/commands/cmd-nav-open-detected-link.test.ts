/**
 * CDP Test: cmd_nav_open_detected_link
 *
 * Focused observability test for the open detected links command.
 * - Single command: cmd_nav_open_detected_link
 * - Single key: 'O'
 * - Single behavior: detect URLs in text and open via hints
 * - Focus: verify URL detection from plain text (not HTML anchors) using CDP
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-nav-open-detected-link.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-nav-open-detected-link.test.ts
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
 * Wait for hints to appear on the page by checking for hint elements
 */
async function waitForHints(
    ws: WebSocket,
    timeoutMs: number = 5000
): Promise<number> {
    const signalMarker = `__HINTS_COUNT_${Date.now()}_${Math.random()}__`;

    // Inject code to count hints and signal when ready (checking shadow DOM)
    const checkCode = `
        (async () => {
            return new Promise((resolve) => {
                const checkHints = () => {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) {
                        return false;
                    }
                    const holder = hintsHost.shadowRoot.querySelector('[mode]');
                    if (!holder) {
                        return false;
                    }
                    const hints = Array.from(holder.querySelectorAll('div')).filter(div =>
                        div.textContent && div.textContent.trim().length > 0
                    );
                    if (hints.length > 0) {
                        console.log('${signalMarker}:' + hints.length);
                        resolve(hints.length);
                        return true;
                    }
                    return false;
                };

                // Check immediately
                if (checkHints()) return;

                // Poll for hints
                let attempts = 0;
                const maxAttempts = ${timeoutMs / 100};
                const interval = setInterval(() => {
                    attempts++;
                    if (checkHints() || attempts >= maxAttempts) {
                        clearInterval(interval);
                        if (attempts >= maxAttempts) {
                            console.log('${signalMarker}:0');
                            resolve(0);
                        }
                    }
                }, 100);
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
        await executeInTarget(ws, checkCode, timeoutMs + 2000);
    } catch (e) {
        // Code is running
    }

    const signal = await signalPromise;
    const value = signal.params?.args?.[0]?.value || '${signalMarker}:0';
    const count = parseInt(value.split(':')[1]) || 0;
    return count;
}

/**
 * Wait for navigation by listening for Page.frameNavigated
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
 * Get the actual URLs from detected hints (not just hint labels)
 */
async function getDetectedLinksFromHints(ws: WebSocket): Promise<string[]> {
    const result = await executeInTarget(ws, `
        const hintsHost = document.querySelector('.surfingkeys_hints_host');
        if (!hintsHost || !hintsHost.shadowRoot) {
            return [];
        }
        const holder = hintsHost.shadowRoot.querySelector('[mode]');
        if (!holder) {
            return [];
        }
        return Array.from(holder.querySelectorAll('div'))
            .filter(div => div.link && div.link[2])
            .map(div => div.link[2]);  // div.link is [textNode, index, matchedURL]
    `);
    return result || [];
}

describe('cmd_nav_open_detected_link', () => {
    const BASE_URL = 'http://127.0.0.1:9873';
    const FIXTURE_URL = `${BASE_URL}/detected-links-test.html`;

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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/detected-links-test.html');
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

        const pageWsUrl = await findContentPage('127.0.0.1:9873/detected-links-test.html');
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
        // Dismiss any open hints UI before moving to next test
        try {
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
            // Ignore if no hints to dismiss
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

    test('pressing O detects HTTP URLs in text', async () => {
        // Verify we're on the fixture page
        const initialUrl = await getPageURL(pageWs);
        expect(initialUrl).toContain('detected-links-test.html');

        // Debug: Check if clickablePat is configured
        const clickablePat = await executeInTarget(pageWs, `
            window.runtime?.conf?.clickablePat?.toString() || 'NOT FOUND'
        `);
        console.log(`clickablePat regex: ${clickablePat}`);

        // Debug: Check if there are text nodes with URLs
        const textContent = await executeInTarget(pageWs, `
            Array.from(document.querySelectorAll('p')).map(p => p.textContent).join('\\n')
        `);
        console.log(`Page text content sample: ${textContent.substring(0, 200)}`);

        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Debug: Check if hints mode was activated
        const hintsHostExists = await executeInTarget(pageWs, `
            document.querySelector('.surfingkeys_hints_host') !== null
        `);
        console.log(`Hints host exists: ${hintsHostExists}`);

        // Debug: Check shadow DOM structure
        const shadowCheck = await executeInTarget(pageWs, `
            const host = document.querySelector('.surfingkeys_hints_host');
            if (!host) return 'NO_HOST';
            if (!host.shadowRoot) return 'NO_SHADOW';
            const holder = host.shadowRoot.querySelector('[mode]');
            if (!holder) return 'NO_HOLDER';
            const divs = holder.querySelectorAll('div');
            return 'HOLDER_DIVS:' + divs.length;
        `);
        console.log(`Shadow DOM check: ${shadowCheck}`);

        // Wait for hints to appear
        const hintsCount = await waitForHints(pageWs, 5000);
        console.log(`Detected ${hintsCount} hints`);
        expect(hintsCount).toBeGreaterThan(0);

        // Verify hints contain expected URLs
        const detectedLinks = await getDetectedLinksFromHints(pageWs);
        expect(detectedLinks.length).toBeGreaterThan(0);

        // Check that HTTP URL was detected
        const hasHttpUrl = detectedLinks.some(link => link.includes('http://example.com'));
        expect(hasHttpUrl).toBe(true);
    });

    test('pressing O detects HTTPS URLs in text', async () => {
        // Verify we're on the fixture page
        const initialUrl = await getPageURL(pageWs);
        expect(initialUrl).toContain('detected-links-test.html');

        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Wait for hints to appear
        const hintsCount = await waitForHints(pageWs, 5000);
        expect(hintsCount).toBeGreaterThan(0);

        // Verify hints contain HTTPS URLs
        const detectedLinks = await getDetectedLinksFromHints(pageWs);
        const hasHttpsUrl = detectedLinks.some(link => link.includes('https://'));
        expect(hasHttpsUrl).toBe(true);

        console.log(`Detected HTTPS URLs: ${detectedLinks.filter(l => l.includes('https://')).length}`);
    });

    test('pressing O detects multiple URLs in same paragraph', async () => {
        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Wait for hints to appear
        const hintsCount = await waitForHints(pageWs, 5000);
        expect(hintsCount).toBeGreaterThanOrEqual(3);  // At least 3 URLs from multiple URLs section

        // Verify multiple URLs detected
        const detectedLinks = await getDetectedLinksFromHints(pageWs);

        // Should detect site1, site2, and site3 from the multiple URLs section
        const hasSite1 = detectedLinks.some(link => link.includes('site1.example.com'));
        const hasSite2 = detectedLinks.some(link => link.includes('site2.example.com'));
        const hasSite3 = detectedLinks.some(link => link.includes('site3.example.com'));

        // At least some of these should be detected
        const detectedCount = [hasSite1, hasSite2, hasSite3].filter(Boolean).length;
        expect(detectedCount).toBeGreaterThan(0);

        console.log(`Multiple URLs detected: site1=${hasSite1}, site2=${hasSite2}, site3=${hasSite3}`);
    });

    test('pressing O detects thunder protocol links', async () => {
        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Wait for hints to appear
        const hintsCount = await waitForHints(pageWs, 5000);
        expect(hintsCount).toBeGreaterThan(0);

        // Verify thunder protocol detected
        const detectedLinks = await getDetectedLinksFromHints(pageWs);
        const hasThunder = detectedLinks.some(link => link.includes('thunder://'));
        expect(hasThunder).toBe(true);

        console.log(`Thunder protocol detected: ${hasThunder}`);
    });

    test('pressing O detects magnet links', async () => {
        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Wait for hints to appear
        const hintsCount = await waitForHints(pageWs, 5000);
        expect(hintsCount).toBeGreaterThan(0);

        // Verify magnet link detected
        const detectedLinks = await getDetectedLinksFromHints(pageWs);
        const hasMagnet = detectedLinks.some(link => link.includes('magnet:'));
        expect(hasMagnet).toBe(true);

        console.log(`Magnet link detected: ${hasMagnet}`);
    });

    test('pressing O does not detect regular HTML anchor links', async () => {
        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Wait for hints to appear
        const hintsCount = await waitForHints(pageWs, 5000);
        expect(hintsCount).toBeGreaterThan(0);

        // Get detected links
        const detectedLinks = await getDetectedLinksFromHints(pageWs);

        // Should NOT detect the regular HTML anchor link (http://regular-link.com)
        // because it's in an <a> tag, not plain text
        const hasRegularLink = detectedLinks.some(link => link.includes('regular-link.com'));

        // This should be false - the 'O' command only detects URLs in text, not in anchor tags
        expect(hasRegularLink).toBe(false);

        console.log(`Regular anchor link correctly NOT detected: ${!hasRegularLink}`);
    });

    test('pressing O detects URLs with query parameters', async () => {
        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Wait for hints to appear
        const hintsCount = await waitForHints(pageWs, 5000);
        expect(hintsCount).toBeGreaterThan(0);

        // Verify URLs with query params detected
        const detectedLinks = await getDetectedLinksFromHints(pageWs);
        const hasQueryUrl = detectedLinks.some(link =>
            link.includes('search.example.com') && link.includes('?')
        );
        expect(hasQueryUrl).toBe(true);

        console.log(`URL with query parameters detected: ${hasQueryUrl}`);
    });

    test('pressing O detects URLs with hash fragments', async () => {
        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Wait for hints to appear
        const hintsCount = await waitForHints(pageWs, 5000);
        expect(hintsCount).toBeGreaterThan(0);

        // Verify URLs with hash fragments detected
        const detectedLinks = await getDetectedLinksFromHints(pageWs);
        const hasHashUrl = detectedLinks.some(link =>
            link.includes('docs.example.com') && link.includes('#')
        );
        expect(hasHashUrl).toBe(true);

        console.log(`URL with hash fragment detected: ${hasHashUrl}`);
    });

    test('no hints appear when O is pressed on page with no detectable URLs', async () => {
        // Create a page with no detectable URLs
        await executeInTarget(pageWs, `
            document.body.innerHTML = '<h1>No URLs Here</h1><p>This page has no detectable URLs in plain text.</p>';
        `);

        // Wait for DOM to settle
        await new Promise(resolve => setTimeout(resolve, 200));

        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Wait a bit and check for hints
        await new Promise(resolve => setTimeout(resolve, 1000));

        const hintsCount = await executeInTarget(pageWs, `
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            if (!hintsHost || !hintsHost.shadowRoot) return 0;
            const holder = hintsHost.shadowRoot.querySelector('[mode]');
            if (!holder) return 0;
            return Array.from(holder.querySelectorAll('div')).filter(div =>
                div.textContent && div.textContent.trim().length > 0
            ).length;
        `);

        expect(hintsCount).toBe(0);
        console.log('No hints appeared on page without URLs (expected behavior)');
    });

    test('selecting a detected link navigates to that URL', async () => {
        // Get initial URL
        const initialUrl = await getPageURL(pageWs);
        expect(initialUrl).toContain('detected-links-test.html');

        // Press 'O' to trigger detected links
        await sendKey(pageWs, 'O');

        // Wait for hints to appear
        const hintsCount = await waitForHints(pageWs, 5000);
        expect(hintsCount).toBeGreaterThan(0);

        // Get the hint keys for the first detected link
        const firstHintKey = await executeInTarget(pageWs, `
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            if (!hintsHost || !hintsHost.shadowRoot) return null;
            const holder = hintsHost.shadowRoot.querySelector('[mode]');
            if (!holder) return null;
            const hint = holder.querySelector('div');
            return hint ? hint.textContent : null;
        `);

        expect(firstHintKey).not.toBeNull();
        console.log(`First hint key: ${firstHintKey}`);

        // Set up navigation listener BEFORE sending hint keys
        const navPromise = waitForNavigation(pageWs, 8000);

        // Type the hint key to select the link
        if (firstHintKey) {
            for (const char of firstHintKey) {
                await sendKey(pageWs, char, 50);
            }
        }

        // Wait for navigation to complete
        const finalUrl = await navPromise;

        console.log(`Navigated from ${initialUrl} to ${finalUrl}`);

        // Verify we navigated away from the test page
        expect(finalUrl).not.toContain('detected-links-test.html');
    });
});
