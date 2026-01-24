/**
 * CDP Test: cmd_scroll_down
 *
 * Focused observability test for the scroll down command.
 * - Single command: cmd_scroll_down
 * - Single key: 'j'
 * - Single behavior: scroll down
 * - Focus: verify command execution and scroll behavior without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-scroll-down.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-scroll-down.test.ts
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
    enableInputDomain,
    waitForSurfingkeysReady,
    waitForScrollChange
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

describe('cmd_scroll_down', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

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
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Reset scroll position before each test
        await executeInTarget(pageWs, 'window.scrollTo(0, 0)');

        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        // Capture coverage snapshot after test and calculate delta
        await captureAfterCoverage(pageWs, currentTestName, beforeCovData);
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

    test('pressing j key scrolls page down', async () => {
        const initialScroll = await getScrollPosition(pageWs);
        expect(initialScroll).toBe(0);

        await sendKey(pageWs, 'j');

        const finalScroll = await waitForScrollChange(pageWs, initialScroll, {
            direction: 'down',
            minDelta: 20
        });

        expect(finalScroll).toBeGreaterThan(initialScroll);
        console.log(`Scroll: ${initialScroll}px → ${finalScroll}px (delta: ${finalScroll - initialScroll}px)`);
    });

    test('scroll down distance is consistent', async () => {
        const start = await getScrollPosition(pageWs);
        expect(start).toBe(0);

        await sendKey(pageWs, 'j');
        const after1 = await waitForScrollChange(pageWs, start, {
            direction: 'down',
            minDelta: 20
        });
        const distance1 = after1 - start;

        await sendKey(pageWs, 'j');
        const after2 = await waitForScrollChange(pageWs, after1, {
            direction: 'down',
            minDelta: 20
        });
        const distance2 = after2 - after1;

        console.log(`1st scroll: ${distance1}px, 2nd scroll: ${distance2}px`);

        // Both scrolls should move roughly the same distance (within 10px tolerance)
        expect(Math.abs(distance1 - distance2)).toBeLessThan(10);
    });

    test('cmd_scroll_down exists in command registry', async () => {
        const hasCommand = await executeInTarget(pageWs, `
            (function() {
                return new Promise((resolve) => {
                    // Wait for defaultSettingsLoaded event to ensure API is ready
                    document.addEventListener('surfingkeys:defaultSettingsLoaded', (event) => {
                        const api = event.detail?.api;
                        if (api && typeof api.getCommand === 'function') {
                            const cmd = api.getCommand('cmd_scroll_down');
                            resolve(cmd !== null && cmd !== undefined);
                        } else {
                            resolve(false);
                        }
                    }, { once: true });

                    // If event already fired, check directly
                    if (window.__skAPI__) {
                        const api = window.__skAPI__;
                        if (typeof api.getCommand === 'function') {
                            const cmd = api.getCommand('cmd_scroll_down');
                            resolve(cmd !== null && cmd !== undefined);
                        } else {
                            resolve(false);
                        }
                    }
                });
            })()
        `);

        expect(hasCommand).toBe(true);
    });

    test('cmd_scroll_down has correct metadata', async () => {
        const metadata = await executeInTarget(pageWs, `
            (function() {
                return new Promise((resolve) => {
                    function checkMetadata(api) {
                        if (!api || typeof api.getCommand !== 'function') {
                            resolve({ error: 'API not available' });
                            return;
                        }

                        const cmd = api.getCommand('cmd_scroll_down');
                        if (!cmd) {
                            resolve({ error: 'Command not found' });
                            return;
                        }

                        resolve({
                            unique_id: cmd.unique_id,
                            category: cmd.category,
                            hasCode: typeof cmd.code === 'function',
                            originalKey: cmd.originalKey
                        });
                    }

                    // Check if API is already available
                    if (window.__skAPI__) {
                        checkMetadata(window.__skAPI__);
                    } else {
                        // Wait for defaultSettingsLoaded event
                        document.addEventListener('surfingkeys:defaultSettingsLoaded', (event) => {
                            checkMetadata(event.detail?.api);
                        }, { once: true });
                    }
                });
            })()
        `);

        expect(metadata.unique_id).toBe('cmd_scroll_down');
        expect(metadata.category).toBe('scroll');
        expect(metadata.hasCode).toBe(true);
        expect(metadata.originalKey).toBe('j');

        console.log('Command metadata:', JSON.stringify(metadata, null, 2));
    });
});
