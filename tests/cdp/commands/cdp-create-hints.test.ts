/**
 * CDP Create Hints Test
 *
 * Tests hint creation when pressing the 'f' key.
 * Verifies DOM manipulation and shadowRoot hint rendering.
 *
 * Includes V8 code coverage collection to measure code paths executed.
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cdp-create-hints.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cdp-create-hints.test.ts
 *   With JSON reporter: npm run test:cdp:headless -- --reporter=json tests/cdp/commands/cdp-create-hints.test.ts
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
    clickAt,
    countElements,
    enableInputDomain
} from '../utils/browser-actions';
import { startCoverage, collectCoverageWithAnalysis } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('DOM Manipulation - Hints', () => {
    jest.setTimeout(60000); // Increase timeout for coverage collection

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';
    const TEST_NAME = 'hints';

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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain
        enableInputDomain(pageWs);

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Start V8 coverage collection
        await startCoverage(pageWs, 'content-page');
    });

    afterAll(async () => {
        // Collect coverage before cleanup
        await collectCoverageWithAnalysis(pageWs, TEST_NAME);

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

    describe('Page Setup', () => {
        test('should have links on page', async () => {
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(200);
        });
    });

    describe('Hint Creation', () => {
        test('should have no hints initially', async () => {
            const initialHints = await executeInTarget(pageWs, `
                document.querySelectorAll('#sk_hints span').length
            `);

            expect(initialHints).toBe(0);
        });

        test('should create hints when pressing f key', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Press 'f' to trigger hints
            await sendKey(pageWs, 'f');

            // Wait for hints to render
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Query hints in shadowRoot
            const hintData = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) {
                        return { found: false, count: 0, hints: [] };
                    }

                    const shadowRoot = hintsHost.shadowRoot;
                    const hintElements = Array.from(shadowRoot.querySelectorAll('div'));

                    // Filter to only hint divs (1-3 uppercase letters)
                    const hintDivs = hintElements.filter(d => {
                        const text = (d.textContent || '').trim();
                        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                    });

                    return {
                        found: true,
                        count: hintDivs.length,
                        hints: hintDivs.slice(0, 5).map(h => ({
                            text: h.textContent?.trim(),
                            visible: h.offsetParent !== null
                        }))
                    };
                })()
            `);

            // Assertions
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(20);
            expect(hintData.count).toBeLessThan(100);

            // Check sample hints are visible
            if (hintData.hints.length > 0) {
                hintData.hints.forEach((hint: any) => {
                    expect(hint.visible).toBe(true);
                    expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
                });
            }
        });

        test('should have hints in shadowRoot at correct host element', async () => {
            const hostInfo = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    return {
                        found: hintsHost ? true : false,
                        hasShadowRoot: hintsHost?.shadowRoot ? true : false,
                        shadowRootChildren: hintsHost?.shadowRoot?.children.length || 0
                    };
                })()
            `);

            expect(hostInfo.found).toBe(true);
            expect(hostInfo.hasShadowRoot).toBe(true);
            expect(hostInfo.shadowRootChildren).toBeGreaterThan(0);
        });
    });
});
