/**
 * CDP Scroll Commands Test - Consolidated
 *
 * Tests scroll command functionality with default and custom configurations.
 * Combines tests for:
 * - Base scroll commands (j/k/gg)
 * - Scroll distance verification
 * - Custom scrollStepSize configuration
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cdp-scroll.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cdp-scroll.test.ts
 */

// TODO(hbt) NEXT [fix] triggers. test involves networking. fixtures? hints is clear though

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
    getScrollPosition,
    getPageTitle,
    getPageURL,
    enableInputDomain
} from '../utils/browser-actions';
import {
    runHeadlessConfigSet,
    clearHeadlessConfig,
    HeadlessConfigSetResult
} from '../utils/config-set-headless';
import { setupPerTestCoverageHooks } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('Scroll Commands', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';

    describe('Default Configuration', () => {
        let bgWs: WebSocket;
        let pageWs: WebSocket;
        let extensionId: string;
        let tabId: number;

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

            // Enable Input domain for keyboard events
            enableInputDomain(pageWs);

            // Wait for page to load and Surfingkeys to inject
            await new Promise(resolve => setTimeout(resolve, 2000));
        });

        const coverageHooks = setupPerTestCoverageHooks(pageWs);
        beforeEach(coverageHooks.beforeEach);
        afterEach(coverageHooks.afterEach);

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

        describe('Page Setup', () => {
            test('should load correct page', async () => {
                const url = await getPageURL(pageWs);
                expect(url).toBe(FIXTURE_URL);
            });

            test('should have correct title', async () => {
                const title = await getPageTitle(pageWs);
                expect(title).toContain('hckr news');
            });
        });

        describe('Scroll Commands (j/k/gg)', () => {
            test('should scroll down when pressing j key', async () => {
                // Get initial scroll position
                const initialScroll = await getScrollPosition(pageWs);
                expect(initialScroll).toBe(0);

                // Press 'j' to scroll down
                await sendKey(pageWs, 'j');

                // Wait for scroll animation
                await new Promise(resolve => setTimeout(resolve, 300));

                // Get new scroll position
                const newScroll = await getScrollPosition(pageWs);

                // Assert scroll happened
                expect(newScroll).toBeGreaterThan(initialScroll);
                expect(newScroll).toBeGreaterThanOrEqual(70); // At least 70px scroll
                expect(newScroll).toBeLessThanOrEqual(120); // At most 120px scroll
            });

            test('should scroll up when pressing k key', async () => {
                // First ensure we're scrolled down
                await sendKey(pageWs, 'j');
                await new Promise(resolve => setTimeout(resolve, 300));

                const scrolledPosition = await getScrollPosition(pageWs);
                expect(scrolledPosition).toBeGreaterThan(0);

                // Press 'k' to scroll up
                await sendKey(pageWs, 'k');
                await new Promise(resolve => setTimeout(resolve, 300));

                const newScroll = await getScrollPosition(pageWs);

                // Assert scroll up happened
                expect(newScroll).toBeLessThan(scrolledPosition);
            });

            test('should scroll to top when pressing gg', async () => {
                // Scroll down first
                await sendKey(pageWs, 'j');
                await sendKey(pageWs, 'j');
                await new Promise(resolve => setTimeout(resolve, 300));

                const scrolledPosition = await getScrollPosition(pageWs);
                expect(scrolledPosition).toBeGreaterThan(0);

                // Press 'gg' to scroll to top
                await sendKey(pageWs, 'g');
                await sendKey(pageWs, 'g');
                await new Promise(resolve => setTimeout(resolve, 300));

                const newScroll = await getScrollPosition(pageWs);
                expect(newScroll).toBe(0);
            });
        });

        describe('Scroll Distance Verification', () => {
            test('measure default scroll distance with j key', async () => {
                const initial = await getScrollPosition(pageWs);
                console.log(`Initial scroll: ${initial}px`);

                // Press 'j' once
                await sendKey(pageWs, 'j');
                await new Promise(resolve => setTimeout(resolve, 500));

                const after1j = await getScrollPosition(pageWs);
                const distance1j = after1j - initial;
                console.log(`After 1x 'j': ${after1j}px (distance: ${distance1j}px)`);

                // Press 'j' again
                await sendKey(pageWs, 'j');
                await new Promise(resolve => setTimeout(resolve, 500));

                const after2j = await getScrollPosition(pageWs);
                const distance2j = after2j - after1j;
                console.log(`After 2x 'j': ${after2j}px (distance: ${distance2j}px)`);

                // Analyze scroll distances
                console.log(`\n=== Analysis ===`);
                console.log(`Distance per 'j': ~${Math.round(distance1j)}px`);
                console.log(`- If ~84px: using default scrollStepSize=70`);
                console.log(`- If ~25px: custom scrollStepSize was applied`);

                // Just verify scrolling happens
                expect(distance1j).toBeGreaterThan(0);
                expect(distance2j).toBeGreaterThan(0);
            });

            test('get current scrollStepSize from extension', async () => {
                try {
                    // Try to get the setting via getSettings
                    const result = await executeInTarget(bgWs, `
                        new Promise((resolve, reject) => {
                            // Just for documentation - this likely won't work from service worker
                            resolve('Cannot query from service worker');
                        })
                    `);
                    console.log(`scrollStepSize query result: ${result}`);
                } catch (error: any) {
                    console.log(`Could not query scrollStepSize from service worker: ${error.message}`);
                }
            });
        });
    });

    describe('Custom Configuration (scrollStepSize=20)', () => {
        let bgWs: WebSocket;
        let pageWs: WebSocket;
        let tabId: number | null = null;
        let configResult!: HeadlessConfigSetResult;
        const CONFIG_FIXTURE_PATH = 'data/fixtures/cdp-scrollstepsize-20-config.js';

        beforeAll(async () => {
            const cdpAvailable = await checkCDPAvailable();
            if (!cdpAvailable) {
                throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
            }

            const bgInfo = await findExtensionBackground();
            bgWs = await connectToCDP(bgInfo.wsUrl);

            // Load config using headless config-set helper
            configResult = await runHeadlessConfigSet({
                bgWs,
                configPath: CONFIG_FIXTURE_PATH,
                waitAfterSetMs: 1200,
                ensureAdvancedMode: true
            });

            if (!configResult.success) {
                throw new Error(`Headless config-set failed: ${configResult.error || 'post-validation mismatch'}`);
            }

            tabId = await createTab(bgWs, FIXTURE_URL, true);
            const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
            pageWs = await connectToCDP(pageWsUrl);
            enableInputDomain(pageWs);

            await new Promise(resolve => setTimeout(resolve, 2000));
        });

        const coverageHooks = setupPerTestCoverageHooks(pageWs);
        beforeEach(coverageHooks.beforeEach);
        afterEach(coverageHooks.afterEach);

        afterAll(async () => {
            if (tabId !== null) {
                await closeTab(bgWs, tabId);
            }
            if (pageWs) {
                await closeCDP(pageWs);
            }
            await clearHeadlessConfig(bgWs).catch(() => undefined);
            await closeCDP(bgWs);
        });

        test('config-set stored fixture hash and localPath', () => {
            expect(configResult.postValidation?.hashMatches).toBe(true);
            expect(configResult.postValidation?.pathMatches).toBe(true);
        });

        test('custom mapkey (w) scrolls down proving config executed', async () => {
            await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
            await new Promise(resolve => setTimeout(resolve, 200));

            const initialScroll = await getScrollPosition(pageWs);
            expect(initialScroll).toBe(0);

            await sendKey(pageWs, 'w');
            await new Promise(resolve => setTimeout(resolve, 400));

            const after = await getScrollPosition(pageWs);
            expect(after).toBeGreaterThan(initialScroll);
        });

        test('pressing j scrolls approximately 20px (custom scrollStepSize)', async () => {
            await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
            await new Promise(resolve => setTimeout(resolve, 200));

            const start = await getScrollPosition(pageWs);
            expect(start).toBe(0);

            await sendKey(pageWs, 'j');
            await new Promise(resolve => setTimeout(resolve, 500));

            const after = await getScrollPosition(pageWs);
            const delta = after - start;
            console.log(`[custom-config] Scroll delta after 'j': ${delta}`);
            if (delta <= 12 || delta >= 32) {
                throw new Error(`Scroll delta mismatch: ${delta}`);
            }
        });
    });
});
