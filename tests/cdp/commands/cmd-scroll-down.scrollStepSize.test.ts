import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    closeCDP,
    executeInTarget
} from '../utils/cdp-client';
import { sendKey, getScrollPosition, waitForScrollChange, enableInputDomain } from '../utils/browser-actions';
import { clearHeadlessConfig } from '../utils/config-set-headless';
import { loadConfigAndOpenPage, ConfigPageContext } from '../utils/config-test-helpers';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Custom scrollStepSize regression test for cmd_scroll_down.
 * Ensures user-provided settings.scrollStepSize is honored by the command.
 */
describe('cmd_scroll_down (custom scrollStepSize)', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    const CONFIG_PATH = 'data/fixtures/cmd-scroll-down.scrollStepSize.js';
    const EXPECTED_STEP = 75; // scroll-test.html CSS results in ~75px per step

    let bgWs: WebSocket;
    let configContext: ConfigPageContext | null = null;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

        configContext = await loadConfigAndOpenPage({
            bgWs,
            configPath: CONFIG_PATH,
            fixtureUrl: FIXTURE_URL
        });

        enableInputDomain(configContext.pageWs);

        // Start V8 coverage collection for page
        await startCoverage(configContext.pageWs, 'content-page');
    });

    beforeEach(async () => {
        if (!configContext) throw new Error('Config context not initialized');
        await executeInTarget(configContext.pageWs, 'window.scrollTo(0, 0)');

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(configContext.pageWs);
    });

    afterEach(async () => {
        // Capture coverage snapshot after test and calculate delta
        if (configContext) {
            await captureAfterCoverage(configContext.pageWs, currentTestName, beforeCovData);
        }
    });

    afterAll(async () => {
        if (configContext) {
            await configContext.dispose();
        }

        if (bgWs) {
            await clearHeadlessConfig(bgWs).catch(() => undefined);
            await closeCDP(bgWs);
        }
    });

    test('scroll down uses configured step size', async () => {
        if (!configContext) throw new Error('Config context not initialized');
        const ws = configContext.pageWs;

        const swStep = await executeInTarget(bgWs, 'runtime && runtime.conf ? runtime.conf.scrollStepSize : null');
        console.log(`service worker scrollStepSize=${swStep}`);

        await new Promise(resolve => setTimeout(resolve, 500));

        const start = await getScrollPosition(ws);
        expect(start).toBe(0);

        await sendKey(ws, 'j');
        const after = await waitForScrollChange(ws, start, {
            direction: 'down',
            minDelta: 5
        });

        const delta = after - start;
        console.log(`Custom scroll delta: ${delta}px`);

        expect(delta).toBeGreaterThan(0);
        expect(Math.abs(delta - EXPECTED_STEP)).toBeLessThanOrEqual(30);
    });
});
