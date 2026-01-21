/**
 * CDP Integration Test: Usage Tracking
 *
 * Verifies that command usage is tracked and stored in chrome.storage.local
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/cdp-usage-tracking.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/cdp-usage-tracking.test.ts
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
    getScrollPosition
} from './utils/browser-actions';
import { CDP_PORT } from './cdp-config';

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

        // Clear any existing usage data
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

        // Wait for SK to initialize
        await new Promise(r => setTimeout(r, 500));
    });

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
            expect(result.commands?.j).toBeDefined();
            expect(result.commands?.j?.count).toBe(1);
            expect(result.commands?.j?.annotation).toBe('Scroll down');
        });

        it('should increment count on repeated command use', async () => {
            // Get current count
            const beforeResult = await executeInTarget(bgWs, `
                new Promise(resolve => {
                    chrome.storage.local.get(['surfingkeys_usage'], r => {
                        resolve(r.surfingkeys_usage?.commands?.j?.count || 0);
                    });
                })
            `);

            // Press j again
            await sendKey(pageWs, 'j');
            await new Promise(r => setTimeout(r, 300));

            // Check count increased
            const afterResult = await executeInTarget(bgWs, `
                new Promise(resolve => {
                    chrome.storage.local.get(['surfingkeys_usage'], r => {
                        resolve(r.surfingkeys_usage?.commands?.j?.count || 0);
                    });
                })
            `);

            expect(afterResult).toBe(beforeResult + 1);
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
            expect(result[0].key).toBe('j');
            expect(result[0].annotation).toBe('Scroll down');
            expect(result[0].timestamp).toBeDefined();
        });

        it('should track multi-key commands like gg', async () => {
            await sendKey(pageWs, 'g');
            await new Promise(r => setTimeout(r, 100));
            await sendKey(pageWs, 'g');
            await new Promise(r => setTimeout(r, 300));

            const result = await executeInTarget(bgWs, `
                new Promise(resolve => {
                    chrome.storage.local.get(['surfingkeys_usage'], r => {
                        resolve(r.surfingkeys_usage?.commands?.gg || null);
                    });
                })
            `);

            expect(result).not.toBeNull();
            expect(result.count).toBeGreaterThan(0);
            expect(result.annotation).toBe('Scroll to the top of the page');
        });
    });
});
