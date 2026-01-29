/**
 * CDP Test: cmd_omnibar_bookmarks
 *
 * Focused observability test for the bookmarks omnibar command.
 * - Single command: cmd_omnibar_bookmarks
 * - Single key: 'b'
 * - Single behavior: open bookmarks omnibar
 * - Focus: verify command execution and omnibar display using frontend iframe
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-omnibar-bookmarks.test.ts
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
    return connectToCDP(frontendTarget.webSocketDebuggerUrl);
}

/**
 * Poll for omnibar visibility via DOM query in frontend frame
 */
async function pollForOmnibarVisible(frontendWs: WebSocket, maxAttempts: number = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const visible = await executeInTarget(frontendWs, `
                (() => {
                    const omnibar = document.getElementById('sk_omnibar');
                    if (!omnibar) return false;

                    const style = window.getComputedStyle(omnibar);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                })()
            `);

            if (visible) {
                return true;
            }
        } catch (err) {
            console.log(`Poll attempt ${i + 1}: Error checking visibility:`, err);
        }
    }
    return false;
}

/**
 * Get omnibar prompt text from frontend
 */
async function getOmnibarPrompt(frontendWs: WebSocket): Promise<string> {
    const prompt = await executeInTarget(frontendWs, `
        (() => {
            const omnibar = document.getElementById('sk_omnibar');
            if (!omnibar) return '';

            const promptSpan = omnibar.querySelector('#sk_omnibarSearchArea>span.prompt');
            return promptSpan ? promptSpan.textContent : '';
        })()
    `);
    return prompt || '';
}


describe('cmd_omnibar_bookmarks', () => {
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

    test('pressing b key opens bookmarks omnibar', async () => {
        // Press 'b' key on page to open bookmarks omnibar
        await sendKey(pageWs, 'b');

        // Wait for frontend to be created
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend iframe
        const frontend = await connectToFrontend();

        // Verify omnibar is visible in frontend
        const omnibarVisible = await pollForOmnibarVisible(frontend);
        expect(omnibarVisible).toBe(true);
        console.log('✓ Bookmarks omnibar opened with "b" key');

        // Cleanup
        await closeCDP(frontend);
    });

    test('bookmarks omnibar shows correct prompt', async () => {
        // Press 'b' key on page to open bookmarks omnibar
        await sendKey(pageWs, 'b');

        // Wait for frontend to be created
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend iframe
        const frontend = await connectToFrontend();

        // Verify omnibar is visible
        const omnibarVisible = await pollForOmnibarVisible(frontend);
        expect(omnibarVisible).toBe(true);

        // Get prompt text
        const prompt = await getOmnibarPrompt(frontend);
        console.log(`Omnibar prompt: "${prompt}"`);

        // Verify prompt contains "bookmark" or "Bookmarks"
        expect(prompt.toLowerCase()).toContain('bookmark');
        console.log('✓ Bookmarks omnibar shows correct prompt');

        // Cleanup
        await closeCDP(frontend);
    });

    test('can open bookmarks omnibar multiple times', async () => {
        // First cycle
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 500));

        let frontend = await connectToFrontend();
        let visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log('✓ Cycle 1: Bookmarks omnibar opened');

        // Close with Escape
        await sendKey(pageWs, 'Escape');
        await closeCDP(frontend);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Second cycle
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 500));

        frontend = await connectToFrontend();
        visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log('✓ Cycle 2: Bookmarks omnibar opened');
        console.log('✓ Bookmarks omnibar works multiple times');

        // Cleanup
        await closeCDP(frontend);
    });
});
