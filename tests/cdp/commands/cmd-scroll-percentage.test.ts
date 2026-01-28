/**
 * CDP Test: cmd_scroll_percentage
 *
 * Focused observability test for the scroll percentage command.
 * - Single command: cmd_scroll_percentage
 * - Single key: '%' (with numeric prefix)
 * - Single behavior: scroll to percentage
 * - Focus: verify command execution and scroll behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-percentage.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-percentage.test.ts
 */

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

describe('cmd_scroll_percentage', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    const CONFIG_PATH = 'data/fixtures/cmd-scroll-percentage.js';

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

    test('pressing 50% scrolls to 50% of page', async () => {
        if (!configContext) throw new Error('Config context not initialized');
        const ws = configContext.pageWs;

        const initialScroll = await getScrollPosition(ws);
        expect(initialScroll).toBe(0);

        // Get scroll height to calculate expected position
        const scrollHeight = await executeInTarget(ws, 'document.documentElement.scrollHeight');
        const expected = Math.floor(scrollHeight * 0.5);

        console.log(`Test setup: scrollHeight=${scrollHeight}, expected 50%=${expected}px`);

        // Send '5', '0', then '%' to trigger 50% scroll
        await sendKey(ws, '5', 200);
        await sendKey(ws, '0', 200);
        await sendKey(ws, '%', 200);

        // Wait for scroll to happen
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check scroll position
        const finalScroll = await getScrollPosition(ws);

        console.log(`Result: ${initialScroll}px → ${finalScroll}px (expected: ${expected}px, delta: ${Math.abs(finalScroll - expected)}px)`);

        // Verify scroll happened
        expect(finalScroll).toBeGreaterThan(initialScroll);
        // Verify scrolled to approximately 50%
        expect(Math.abs(finalScroll - expected)).toBeLessThan(50);
    });

    test('pressing 25% scrolls to 25% of page', async () => {
        if (!configContext) throw new Error('Config context not initialized');
        const ws = configContext.pageWs;

        const initialScroll = await getScrollPosition(ws);
        expect(initialScroll).toBe(0);

        // Get scroll height to calculate expected position
        const scrollHeight = await executeInTarget(ws, 'document.documentElement.scrollHeight');
        const expected = Math.floor(scrollHeight * 0.25);

        console.log(`Test setup: scrollHeight=${scrollHeight}, expected 25%=${expected}px`);

        // Send '2', '5', then '%' to trigger 25% scroll
        await sendKey(ws, '2', 200);
        await sendKey(ws, '5', 200);
        await sendKey(ws, '%', 200);

        // Wait for scroll to happen
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check scroll position
        const finalScroll = await getScrollPosition(ws);

        console.log(`Result: ${initialScroll}px → ${finalScroll}px (expected: ${expected}px, delta: ${Math.abs(finalScroll - expected)}px)`);

        // Verify scroll happened
        expect(finalScroll).toBeGreaterThan(initialScroll);
        // Verify scrolled to approximately 25%
        expect(Math.abs(finalScroll - expected)).toBeLessThan(50);
    });
});
