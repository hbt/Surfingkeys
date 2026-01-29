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
 * Find frontend iframe target
 */
async function findFrontendTarget(): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = require('http').get(`http://127.0.0.1:${CDP_PORT}/json`, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', () => {
                const targets = JSON.parse(data);
                const frontendTarget = targets.find((t: any) =>
                    t.url && t.url.includes('frontend.html') && t.webSocketDebuggerUrl
                );
                if (!frontendTarget) {
                    reject(new Error('Frontend target not found'));
                } else {
                    resolve(frontendTarget);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

/**
 * Connect to frontend iframe
 */
async function connectToFrontend(): Promise<WebSocket> {
    const frontendTarget = await findFrontendTarget();
    const ws = await connectToCDP(frontendTarget.webSocketDebuggerUrl);

    // Enable Input domain for keyboard events on frontend
    ws.send(JSON.stringify({
        id: Math.floor(Math.random() * 100000),
        method: 'Input.enable'
    }));

    await new Promise(resolve => setTimeout(resolve, 100));
    return ws;
}

/**
 * Send Escape key to close omnibar
 * Uses complete key event sequence with code parameter
 */
async function sendEscapeToFrontend(frontendWs: WebSocket): Promise<void> {
    const messageId = Math.floor(Math.random() * 100000);

    // keyDown
    frontendWs.send(JSON.stringify({
        id: messageId,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: 'Escape',
            code: 'Escape',
            windowsVirtualKeyCode: 27,
            nativeVirtualKeyCode: 27
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 50));

    // keyUp
    frontendWs.send(JSON.stringify({
        id: messageId + 1,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: 'Escape',
            code: 'Escape',
            windowsVirtualKeyCode: 27,
            nativeVirtualKeyCode: 27
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Check if omnibar is visible by checking iframe height in shadow DOM from page context
 * This is more reliable than querying the frontend iframe directly
 */
async function isOmnibarVisibleFromPage(pageWs: WebSocket): Promise<boolean> {
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
                        return heightStr !== '0px' && heightStr !== '';
                    }
                }
            }
            return false;
        })()
    `);
    return result;
}

/**
 * Check if omnibar is visible in frontend context
 * Returns detailed state for debugging
 */
async function getOmnibarState(frontendWs: WebSocket): Promise<any> {
    const state = await executeInTarget(frontendWs, `
        (() => {
            const omnibar = document.getElementById('sk_omnibar');
            if (!omnibar) return { exists: false };

            const computed = window.getComputedStyle(omnibar);
            const inline = omnibar.style;

            return {
                exists: true,
                computedDisplay: computed.display,
                computedVisibility: computed.visibility,
                inlineDisplay: inline.display,
                inlineVisibility: inline.visibility,
                visible: computed.display !== 'none' && computed.visibility !== 'hidden'
            };
        })()
    `);
    return state;
}

/**
 * Check if omnibar is visible in frontend context
 */
async function isOmnibarVisible(frontendWs: WebSocket): Promise<boolean> {
    const state = await getOmnibarState(frontendWs);
    return state.exists && state.visible;
}

/**
 * Poll for omnibar visibility in frontend context
 */
async function pollForOmnibarVisible(frontendWs: WebSocket, expected: boolean, maxAttempts: number = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const state = await getOmnibarState(frontendWs);
            const visible = state.exists && state.visible;

            if (i === 0 || i === maxAttempts - 1 || visible === expected) {
                console.log(`Poll attempt ${i + 1}/${maxAttempts}:`, JSON.stringify(state));
            }

            if (visible === expected) {
                return true;
            }
        } catch (err) {
            console.log(`Poll attempt ${i + 1}: Error checking visibility:`, err);
            // If we get an error and we're expecting false (closed), that might mean the frontend is gone
            if (expected === false) {
                console.log(`Frontend query failed - omnibar might be closed`);
                // Don't return true yet, keep polling to be sure
            }
        }
    }

    console.log(`Poll timed out after ${maxAttempts} attempts`);
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
        // Open the omnibar with 't' key
        await sendKey(pageWs, 't');

        // Wait for frontend to be created
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend iframe
        const frontend = await connectToFrontend();

        // Verify omnibar is visible
        const becameVisible = await pollForOmnibarVisible(frontend, true);
        expect(becameVisible).toBe(true);
        console.log('✓ Omnibar opened with "t" key');

        // Send Escape key to FRONTEND iframe to close omnibar
        await sendEscapeToFrontend(frontend);

        // Verify omnibar closed - check from page context via shadow DOM iframe height
        const visibleFromPage = await isOmnibarVisibleFromPage(pageWs);
        expect(visibleFromPage).toBe(false);
        console.log('✓ Omnibar closed after pressing Escape');

        // Cleanup
        await closeCDP(frontend);
    });

    test('can open and close omnibar multiple times', async () => {
        // First cycle
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        let frontend = await connectToFrontend();
        let visible = await pollForOmnibarVisible(frontend, true);
        expect(visible).toBe(true);
        console.log('✓ Cycle 1: Omnibar opened');

        await sendEscapeToFrontend(frontend);

        let closed = await isOmnibarVisibleFromPage(pageWs);
        expect(closed).toBe(false);
        console.log('✓ Cycle 1: Omnibar closed');

        await closeCDP(frontend);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Second cycle
        await sendKey(pageWs, 't');
        await new Promise(resolve => setTimeout(resolve, 500));

        frontend = await connectToFrontend();
        visible = await pollForOmnibarVisible(frontend, true);
        expect(visible).toBe(true);
        console.log('✓ Cycle 2: Omnibar opened');

        await sendEscapeToFrontend(frontend);

        closed = await isOmnibarVisibleFromPage(pageWs);
        expect(closed).toBe(false);
        console.log('✓ Cycle 2: Omnibar closed');

        await closeCDP(frontend);
    });
});
