import WebSocket from 'ws';
import { checkCDPAvailable, findExtensionBackground, findContentPage, connectToCDP, createTab, closeTab, closeCDP, executeInTarget } from '../utils/cdp-client';
import { sendKey, getScrollPosition, enableInputDomain, waitForSurfingkeysReady, waitForScrollChange } from '../utils/browser-actions';
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
        // Scroll to bottom of page for scroll up tests
        await executeInTarget(pageWs, 'window.scrollTo(0, document.body.scrollHeight)');
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
        await sendKey(pageWs, 'k');
        const finalScroll = await waitForScrollChange(pageWs, initialScroll, { direction: 'up', minDelta: 20 });
        expect(finalScroll).toBeLessThan(initialScroll);
        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px (delta: ${initialScroll - finalScroll}px)`);
    });

    test('scroll up distance is consistent', async () => {
        const start = await getScrollPosition(pageWs);
        expect(start).toBeGreaterThan(0);
        await sendKey(pageWs, 'k');
        const after1 = await waitForScrollChange(pageWs, start, { direction: 'up', minDelta: 20 });
        const distance1 = start - after1;
        await sendKey(pageWs, 'k');
        const after2 = await waitForScrollChange(pageWs, after1, { direction: 'up', minDelta: 20 });
        const distance2 = after1 - after2;
        console.log(`1st scroll: ${distance1}px, 2nd scroll: ${distance2}px, delta: ${Math.abs(distance1 - distance2)}px`);
        expect(Math.abs(distance1 - distance2)).toBeLessThan(15);
    });
});
