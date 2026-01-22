/**
 * CDP Custom Config Injection Test - Surfingkeys Command Verification
 *
 * Mirrors the base keyboard test so we can validate scenarios that depend on
 * config injection (showAdvanced/chrome.userScripts availability, etc.).
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/cdp-custom-config-injection.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/cdp-custom-config-injection.test.ts
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    findContentPage,
    connectToCDP,
    createTab,
    closeTab,
    closeCDP
} from './utils/cdp-client';
import {
    sendKey,
    clickAt,
    getScrollPosition,
    getPageTitle,
    getPageURL,
    enableInputDomain
} from './utils/browser-actions';
import { CDP_PORT } from './cdp-config';

describe('Custom Config Keyboard Commands', () => {
    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';

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

    describe('Scroll Commands', () => {
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
});
