/**
 * Custom Config Test - Verify scrollStepSize from /home/hassen/.surfingkeys-2026.js
 *
 * This test verifies that custom configuration settings are properly loaded
 * and applied, specifically testing scrollStepSize setting.
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/cdp-custom-config.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/cdp-custom-config.test.ts
 *
 * Headless Mode: No proxy needed - uses CDP to inject config directly into storage.
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
} from './utils/cdp-client';
import {
    sendKey,
    getScrollPosition,
    enableInputDomain
} from './utils/browser-actions';
import {
    injectSettings
} from './utils/config-injector';
import {
    startConfigServer,
    stopConfigServer
} from './utils/config-server';
import { CDP_PORT } from './cdp-config';

describe('Custom Config - scrollStepSize', () => {
    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let tabId: number;
    let configServerUrl: string;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';
    const CONFIG_SERVER_PORT = 9874;
    const CUSTOM_SCROLL_STEP_SIZE = 25; // From .surfingkeys-2026.js

    beforeAll(async () => {
        // Check CDP is available
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        // Start config server serving from data/fixtures/
        configServerUrl = await startConfigServer(CONFIG_SERVER_PORT, 'cdp-scrollstepsize-config.js');
        console.log(`✓ Config server started: ${configServerUrl}`);

        // Connect to background
        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

        // Inject config file path into extension storage
        // Extension will load and apply settings from the config file
        const injectionResult = await injectSettings(bgWs, {
            scrollStepSize: CUSTOM_SCROLL_STEP_SIZE,
            smoothScroll: false
        }, configServerUrl);

        if (!injectionResult.success) {
            throw new Error(`Failed to inject config: ${injectionResult.error}`);
        }
        console.log(`✓ Config injected: ${configServerUrl}`);

        // Wait for extension to load and apply config
        await new Promise(resolve => setTimeout(resolve, 1500));

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

        // Stop config server
        await stopConfigServer();
        console.log(`✓ Config server stopped`);
    });

    describe('scrollStepSize Configuration', () => {
        test('scrollStepSize should be set to custom value (25px)', async () => {
            // Get the scrollStepSize via getSettings
            const result = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'getSettings',
                        key: 'RAW'
                    }, (response) => {
                        resolve(response.conf?.scrollStepSize);
                    });
                })
            `);

            // Should be the custom value from config
            expect(result).toBe(CUSTOM_SCROLL_STEP_SIZE);
            console.log(`✓ scrollStepSize correctly set to: ${result}px`);
        });

        test('should scroll approximately 25px when pressing j with custom config', async () => {
            // Get initial scroll position
            const initialScroll = await getScrollPosition(pageWs);
            expect(initialScroll).toBe(0);

            // Press 'j' to scroll down
            await sendKey(pageWs, 'j');

            // Wait for scroll animation to complete
            // Duration = Math.max(100, 20 * Math.log(25)) ≈ 100ms
            await new Promise(resolve => setTimeout(resolve, 400));

            // Get new scroll position
            const newScroll = await getScrollPosition(pageWs);

            // Log for debugging
            const scrollDistance = newScroll - initialScroll;
            console.log(`Initial scroll: ${initialScroll}, After j: ${newScroll}, Distance: ${scrollDistance}px`);

            // Assert scroll happened
            expect(newScroll).toBeGreaterThan(initialScroll);

            // With scrollStepSize=25, actual scroll should be ~25px
            // Allow range: 15-40px to account for animation smoothing
            expect(scrollDistance).toBeGreaterThanOrEqual(15);
            expect(scrollDistance).toBeLessThanOrEqual(40);

            console.log(`✓ Single scroll distance: ${scrollDistance}px (expected ~25px)`);
        });

        test('multiple j presses should accumulate with custom step size', async () => {
            // Scroll to top first
            await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
            await new Promise(resolve => setTimeout(resolve, 200));

            const initialScroll = await getScrollPosition(pageWs);
            expect(initialScroll).toBe(0);

            // Press 'j' three times
            for (let i = 0; i < 3; i++) {
                await sendKey(pageWs, 'j');
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Wait for all animations to complete
            await new Promise(resolve => setTimeout(resolve, 600));

            const finalScroll = await getScrollPosition(pageWs);

            // Should have scrolled down
            expect(finalScroll).toBeGreaterThan(initialScroll);

            // With 3 presses at ~25px each, should be around 75px (±40px tolerance for animation variance)
            const totalScroll = finalScroll - initialScroll;
            console.log(`Total scroll after 3 j presses: ${totalScroll}px (expected ~75px)`);
            expect(totalScroll).toBeGreaterThanOrEqual(40);
            expect(totalScroll).toBeLessThanOrEqual(120);

            console.log(`✓ Multiple scrolls working correctly with custom step size`);
        });

        test('config should differ from default (70px)', async () => {
            // Verify custom config differs from default
            const result = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'getSettings',
                        key: 'RAW'
                    }, (response) => {
                        resolve(response.conf?.scrollStepSize);
                    });
                })
            `);

            // Custom config = 25px, default = 70px
            expect(result).not.toBe(70);
            expect(result).toBe(CUSTOM_SCROLL_STEP_SIZE);

            console.log(`✓ Config successfully differs from default: ${result}px vs 70px (default)`);
        });
    });
});
