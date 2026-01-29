/**
 * CDP Test: cmd_nav_reload
 *
 * Focused observability test for the page reload command.
 * - Single command: cmd_nav_reload
 * - Single key: 'r'
 * - Single behavior: reload the current page from cache
 * - Focus: verify command execution and page reload using CDP events
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-nav-reload.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-nav-reload.test.ts
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
    enableInputDomain,
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { waitForCDPEvent } from '../utils/event-driven-waits';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Wait for page navigation to complete using CDP Page.lifecycleEvent
 * Returns when the page reaches 'load' or 'networkIdle' state
 */
async function waitForPageLoad(ws: WebSocket, timeoutMs: number = 10000): Promise<void> {
    // Enable Page domain to receive lifecycle events
    ws.send(JSON.stringify({
        id: Math.floor(Math.random() * 100000),
        method: 'Page.enable'
    }));

    // Wait for Page.loadEventFired which signals document load completed
    await waitForCDPEvent(
        ws,
        (msg) => msg.method === 'Page.loadEventFired',
        timeoutMs
    );
}

describe('cmd_nav_reload', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Enable Page domain for navigation events
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Page.enable'
        }));

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
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

    test('pressing r reloads the page', async () => {
        // Inject a unique timestamp marker into the page
        const markerBefore = Date.now();
        await executeInTarget(pageWs, `window.__reloadTestMarker = ${markerBefore}`);

        // Verify marker was set
        const markerCheck = await executeInTarget(pageWs, 'window.__reloadTestMarker');
        expect(markerCheck).toBe(markerBefore);
        console.log(`Marker set: ${markerBefore}`);

        // Set up listener for page load event BEFORE pressing 'r'
        const loadPromise = waitForPageLoad(pageWs, 10000);

        // Press 'r' to reload
        await sendKey(pageWs, 'r');

        // Wait for page load to complete
        await loadPromise;
        console.log('Page load event detected');

        // Wait for Surfingkeys to re-inject after reload
        await waitForSurfingkeysReady(pageWs);

        // Verify the marker is gone (page was reloaded)
        const markerAfter = await executeInTarget(pageWs, 'window.__reloadTestMarker');
        expect(markerAfter).toBeUndefined();
        console.log('Marker after reload: undefined (page was reloaded)');
    });

    test('page content is preserved after reload', async () => {
        // Get page title before reload
        const titleBefore = await executeInTarget(pageWs, 'document.title');
        expect(titleBefore).toBeTruthy();
        console.log(`Title before reload: ${titleBefore}`);

        // Set up listener for page load event
        const loadPromise = waitForPageLoad(pageWs, 10000);

        // Press 'r' to reload
        await sendKey(pageWs, 'r');

        // Wait for reload to complete
        await loadPromise;

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs);

        // Verify page title is the same (content preserved)
        const titleAfter = await executeInTarget(pageWs, 'document.title');
        expect(titleAfter).toBe(titleBefore);
        console.log(`Title after reload: ${titleAfter}`);
    });

    test('pressing 2r triggers reload command with repeat count', async () => {
        // Set a marker in sessionStorage that persists across reloads
        await executeInTarget(pageWs, `window.sessionStorage.setItem('testMarker', 'before2r')`);

        // Verify marker was set
        const markerBefore = await executeInTarget(pageWs, `window.sessionStorage.getItem('testMarker')`);
        expect(markerBefore).toBe('before2r');
        console.log('Marker set in sessionStorage: before2r');

        // Set up listener for page load event
        const loadPromise = waitForPageLoad(pageWs, 15000);

        // Send '2' followed by 'r' to create 2r command
        await sendKey(pageWs, '2', 50);
        await sendKey(pageWs, 'r');

        // Wait for at least one reload to complete
        // Note: chrome.tabs.reload is called twice, but both may happen rapidly
        await loadPromise;
        console.log('Reload completed');

        // Wait for Surfingkeys to re-inject
        await waitForSurfingkeysReady(pageWs, { timeoutMs: 10000 });

        // After reload, the marker should still be in sessionStorage
        // (proving reload happened, but sessionStorage persists)
        const markerAfter = await executeInTarget(pageWs, `window.sessionStorage.getItem('testMarker')`);
        expect(markerAfter).toBe('before2r');
        console.log('Marker persisted after reload (sessionStorage survives reload)');

        // Now set a window variable that won't survive reload
        await executeInTarget(pageWs, `window.__tempVar = 'shouldBeCleared'`);
        const tempBefore = await executeInTarget(pageWs, `window.__tempVar`);
        expect(tempBefore).toBe('shouldBeCleared');

        // Do another reload to verify the temp variable is cleared
        const load2Promise = waitForPageLoad(pageWs, 10000);
        await sendKey(pageWs, 'r');
        await load2Promise;
        await waitForSurfingkeysReady(pageWs);

        // Verify window variable was cleared by reload
        const tempAfter = await executeInTarget(pageWs, `window.__tempVar`);
        expect(tempAfter).toBeUndefined();
        console.log('Window variable cleared by reload');

        // Cleanup
        await executeInTarget(pageWs, `window.sessionStorage.removeItem('testMarker')`);
    });
});
