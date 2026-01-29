/**
 * CDP Test: cmd_omnibar_close
 *
 * Focused observability test for the omnibar close command.
 * - Single command: cmd_omnibar_close
 * - Single key: 'Escape'
 * - Single behavior: close the omnibar
 * - Focus: verify command execution and omnibar visibility changes
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-omnibar-close.test.ts
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
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Check if omnibar is visible by checking the frontend iframe height
 * When omnibar is closed, iframe.style.height is "0px"
 * When omnibar is open, iframe.style.height changes to a non-zero value (e.g., "100%")
 * The iframe is inside a shadow root attached to a div element
 */
async function isOmnibarVisible(pageWs: WebSocket): Promise<boolean> {
    const result = await executeInTarget(pageWs, `
        (() => {
            // Find all divs and look for one with a shadow root containing the sk_ui iframe
            const divs = document.querySelectorAll('div');
            for (const div of divs) {
                if (div.shadowRoot) {
                    const iframe = div.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe) {
                        // Check iframe height - it's NOT "0px" when omnibar is open
                        const heightStr = iframe.style.height;
                        const isOpen = heightStr !== '0px';
                        return isOpen;
                    }
                }
            }
            return false;
        })()
    `);
    return result;
}

/**
 * Poll for omnibar visibility
 */
async function pollForOmnibarVisible(pageWs: WebSocket, expected: boolean, maxAttempts: number = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));

        const visible = await isOmnibarVisible(pageWs);
        if (visible === expected) {
            return true;
        }
    }
    return false;
}

describe('cmd_omnibar_close', () => {
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

        // Ensure omnibar is closed before each test
        const initialVisible = await isOmnibarVisible(pageWs);
        if (initialVisible) {
            await sendKey(pageWs, 'Escape');
            await pollForOmnibarVisible(pageWs, false);
        }
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

    test('pressing Escape closes the omnibar', async () => {
        // First, open the omnibar with 't' key
        await sendKey(pageWs, 't');

        // Give time for the omnibar to open
        await new Promise(resolve => setTimeout(resolve, 300));

        // Wait for omnibar to become visible
        const becameVisible = await pollForOmnibarVisible(pageWs, true);
        expect(becameVisible).toBe(true);
        console.log('✓ Omnibar opened with "t" key');

        // Verify omnibar is actually visible
        const visibleBefore = await isOmnibarVisible(pageWs);
        expect(visibleBefore).toBe(true);
        console.log('✓ Omnibar is visible before closing');

        // Now press Escape to close it
        await sendKey(pageWs, 'Escape');

        // Wait for omnibar to become hidden
        const becameHidden = await pollForOmnibarVisible(pageWs, false);
        expect(becameHidden).toBe(true);
        console.log('✓ Omnibar closed after pressing Escape');

        // Verify omnibar is actually hidden
        const visibleAfter = await isOmnibarVisible(pageWs);
        expect(visibleAfter).toBe(false);
        console.log('✓ Omnibar is hidden after closing');
    });

    test('pressing Escape when omnibar is already closed has no effect', async () => {
        // Ensure omnibar is closed
        const initialVisible = await isOmnibarVisible(pageWs);
        expect(initialVisible).toBe(false);
        console.log('✓ Omnibar starts closed');

        // Press Escape when already closed
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify omnibar is still closed
        const stillClosed = await isOmnibarVisible(pageWs);
        expect(stillClosed).toBe(false);
        console.log('✓ Omnibar remains closed after Escape on closed omnibar');
    });

    test('can open and close omnibar multiple times', async () => {
        // First cycle
        await sendKey(pageWs, 't');
        const visible1 = await pollForOmnibarVisible(pageWs, true);
        expect(visible1).toBe(true);
        console.log('✓ Cycle 1: Omnibar opened');

        await sendKey(pageWs, 'Escape');
        const hidden1 = await pollForOmnibarVisible(pageWs, false);
        expect(hidden1).toBe(true);
        console.log('✓ Cycle 1: Omnibar closed');

        // Second cycle
        await sendKey(pageWs, 't');
        const visible2 = await pollForOmnibarVisible(pageWs, true);
        expect(visible2).toBe(true);
        console.log('✓ Cycle 2: Omnibar opened');

        await sendKey(pageWs, 'Escape');
        const hidden2 = await pollForOmnibarVisible(pageWs, false);
        expect(hidden2).toBe(true);
        console.log('✓ Cycle 2: Omnibar closed');

        // Third cycle
        await sendKey(pageWs, 't');
        const visible3 = await pollForOmnibarVisible(pageWs, true);
        expect(visible3).toBe(true);
        console.log('✓ Cycle 3: Omnibar opened');

        await sendKey(pageWs, 'Escape');
        const hidden3 = await pollForOmnibarVisible(pageWs, false);
        expect(hidden3).toBe(true);
        console.log('✓ Cycle 3: Omnibar closed');
    });

    test('Escape closes omnibar opened with different commands', async () => {
        // Test with 'b' (bookmarks)
        await sendKey(pageWs, 'b');
        const visibleB = await pollForOmnibarVisible(pageWs, true);
        expect(visibleB).toBe(true);
        console.log('✓ Omnibar opened with "b" (bookmarks)');

        await sendKey(pageWs, 'Escape');
        const hiddenB = await pollForOmnibarVisible(pageWs, false);
        expect(hiddenB).toBe(true);
        console.log('✓ Omnibar closed after "b" command');

        // Test with 'ox' (recently closed)
        await sendKey(pageWs, 'o');
        await sendKey(pageWs, 'x');
        const visibleOx = await pollForOmnibarVisible(pageWs, true);
        expect(visibleOx).toBe(true);
        console.log('✓ Omnibar opened with "ox" (recently closed)');

        await sendKey(pageWs, 'Escape');
        const hiddenOx = await pollForOmnibarVisible(pageWs, false);
        expect(hiddenOx).toBe(true);
        console.log('✓ Omnibar closed after "ox" command');

        // Test with 'go' (open URL in current tab)
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'o');
        const visibleGo = await pollForOmnibarVisible(pageWs, true);
        expect(visibleGo).toBe(true);
        console.log('✓ Omnibar opened with "go" (open URL in current tab)');

        await sendKey(pageWs, 'Escape');
        const hiddenGo = await pollForOmnibarVisible(pageWs, false);
        expect(hiddenGo).toBe(true);
        console.log('✓ Omnibar closed after "go" command');
    });
});
