import WebSocket from 'ws';
import { checkCDPAvailable, findExtensionBackground, findContentPage, connectToCDP, createTab, closeTab, closeCDP, executeInTarget } from '../utils/cdp-client';
import { getScrollPosition, enableInputDomain, waitForSurfingkeysReady } from '../utils/browser-actions';
import { sendKeyAndWaitForScroll } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_scroll_up', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        const bgInfo = await findExtensionBackground();
        extensionId = bgInfo.extensionId;
        bgWs = await connectToCDP(bgInfo.wsUrl);
        tabId = await createTab(bgWs, FIXTURE_URL, true);
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        await waitForSurfingkeysReady(pageWs);
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Scroll to near bottom of page for scroll up tests (leave enough room for multiple scrolls)
        await executeInTarget(pageWs, 'window.scrollTo(0, Math.max(500, document.body.scrollHeight - window.innerHeight - 200))');
        // Wait for scroll to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        await captureAfterCoverage(pageWs, currentTestName, beforeCovData);
    });

    afterAll(async () => {
        if (tabId && bgWs) await closeTab(bgWs, tabId);
        if (pageWs) await closeCDP(pageWs);
        if (bgWs) await closeCDP(bgWs);
    });

    test('pressing k key scrolls page up', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBeGreaterThan(0);

        // Use atomic pattern: listener attached BEFORE key sent
        const result = await sendKeyAndWaitForScroll(pageWs, 'k', { direction: 'up', minDelta: 20 });

        expect(result.final).toBeLessThan(result.baseline);
        console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
    });

    test('scroll up distance is consistent', async () => {
        const start = await getScrollPosition(pageWs);
        expect(start).toBeGreaterThan(0);

        // Use atomic pattern for both scrolls
        const result1 = await sendKeyAndWaitForScroll(pageWs, 'k', { direction: 'up', minDelta: 20 });
        const result2 = await sendKeyAndWaitForScroll(pageWs, 'k', { direction: 'up', minDelta: 20 });

        console.log(`1st scroll: ${result1.delta}px, 2nd scroll: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);
        expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(15);
    });
});
