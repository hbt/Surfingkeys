/**
 * CDP Integration Test: Usage Tracking
 *
 * Verifies that command usage is tracked and stored in chrome.storage.local
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/pages/cdp-usage-tracking.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/pages/cdp-usage-tracking.test.ts
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
    getScrollPosition,
    enableInputDomain
} from '../utils/browser-actions';
import { setupPerTestCoverageHooks } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('Usage Tracking', () => {
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

        // Wait for SK to initialize and content scripts to load
        await new Promise(r => setTimeout(r, 1500));

        // Clear any existing usage data to start fresh
        await executeInTarget(bgWs, `
            new Promise(resolve => {
                chrome.storage.local.set({
                    surfingkeys_usage: {
                        commands: {},
                        recentHistory: [],
                        stats: { totalInvocations: 0, firstTracked: null, lastTracked: null }
                    }
                }, resolve);
            })
        `);

        // Wait for tracking system to be ready
        await new Promise(r => setTimeout(r, 800));
    });

    const coverageHooks = setupPerTestCoverageHooks(pageWs);
    beforeEach(coverageHooks.beforeEach);
    afterEach(coverageHooks.afterEach);

    afterAll(async () => {
        if (tabId) await closeTab(bgWs, tabId);
        closeCDP(bgWs);
        closeCDP(pageWs);
    });

    describe('Command Tracking', () => {
        it('should track command usage when pressing j key', async () => {
            // Press j key to scroll down
            await sendKey(pageWs, 'j');
            await new Promise(r => setTimeout(r, 300));

            // Check that usage was tracked
            const result = await executeInTarget(bgWs, `
                new Promise(resolve => {
                    chrome.storage.local.get(['surfingkeys_usage'], r => {
                        resolve(r.surfingkeys_usage || {});
                    });
                })
            `);

            expect(result.stats?.totalInvocations).toBeGreaterThan(0);

            // Find the command by key='j' (indexed by command_id)
            const jCommand = Object.values(result.commands || {}).find((cmd: any) => cmd.key === 'j') as any;
            expect(jCommand).toBeDefined();
            expect(jCommand?.count).toBeGreaterThanOrEqual(1);
            expect(jCommand?.display_name).toBe('Scroll down');
            expect(jCommand?.command_id).toBeDefined();
        });

        it('should track recent history', async () => {
            const result = await executeInTarget(bgWs, `
                new Promise(resolve => {
                    chrome.storage.local.get(['surfingkeys_usage'], r => {
                        resolve(r.surfingkeys_usage?.recentHistory || []);
                    });
                })
            `);

            expect(result.length).toBeGreaterThan(0);
            // Most recent j command should be at the front (unshift adds to beginning)
            const recentJCommand = result.find((cmd: any) => cmd.key === 'j') as any;
            expect(recentJCommand).toBeDefined();
            expect(recentJCommand?.key).toBe('j');
            expect(recentJCommand?.display_name).toBe('Scroll down');
            expect(recentJCommand?.timestamp).toBeDefined();
            expect(recentJCommand?.command_id).toBeDefined();
        });
    });
});
