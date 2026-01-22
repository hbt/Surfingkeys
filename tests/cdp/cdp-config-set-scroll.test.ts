/**
 * Headless Config-Set Scroll Test
 *
 * Verifies that we can load a custom Surfingkeys config file via the
 * headless config-set helper, then confirm scrollStepSize and custom
 * user script behavior inside a headless CDP test.
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
    enableInputDomain,
    sendKey,
    getScrollPosition
} from './utils/browser-actions';
import {
    runHeadlessConfigSet,
    clearHeadlessConfig,
    HeadlessConfigSetResult
} from './utils/config-set-headless';
import { CDP_PORT } from './cdp-config';

const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';
const CONFIG_FIXTURE_PATH = 'data/fixtures/cdp-scrollstepsize-20-config.js';

describe('Headless config-set - scrollStepSize = 20', () => {
    let bgWs!: WebSocket;
    let pageWs!: WebSocket;
    let tabId: number | null = null;
    let configResult!: HeadlessConfigSetResult;

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

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

    test('pressing j scrolls approximately 20px', async () => {
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');
        await new Promise(resolve => setTimeout(resolve, 200));

        const start = await getScrollPosition(pageWs);
        expect(start).toBe(0);

        await sendKey(pageWs, 'j');
        await new Promise(resolve => setTimeout(resolve, 500));

        const after = await getScrollPosition(pageWs);
        const delta = after - start;
        console.log(`[headless-config-set] Scroll delta after 'j': ${delta}`);
        if (delta <= 12 || delta >= 32) {
            throw new Error(`Scroll delta mismatch: ${delta}`);
        }
    });
});
