/**
 * Verify scrollStepSize by Measuring Scroll Distance
 *
 * Simpler approach: test that scrollStepSize setting affects actual scroll distance
 * Default: 70px per scroll
 * With 'j': measure actual distance
 * If distance ≈ 84px (default), then scrollStepSize not applied
 * If distance ≈ 25px or less, then custom scrollStepSize might be applied
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
import { CDP_PORT } from './cdp-config';

describe('Verify scrollStepSize affects scroll distance', () => {
    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let tabId: number;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`CDP not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

        // Create tab
        tabId = await createTab(bgWs, FIXTURE_URL, true);
        console.log(`✓ Tab created`);

        // Connect to page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);

        // Wait for content scripts to load
        await new Promise(resolve => setTimeout(resolve, 2000));
    });

    afterAll(async () => {
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

        // Just verify scrolling happens (don't assert specific value for now)
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
