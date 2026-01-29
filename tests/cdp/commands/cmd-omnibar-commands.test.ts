/**
 * CDP Test: cmd_omnibar_commands
 *
 * Focused observability test for the commands omnibar command.
 * - Single command: cmd_omnibar_commands
 * - Single key: ':'
 * - Single behavior: open commands omnibar
 * - Focus: verify omnibar opens and displays commands prompt
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-omnibar-commands.test.ts
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
 * Poll for omnibar visibility in frontend context
 */
async function pollForOmnibarVisible(frontendWs: WebSocket, maxAttempts: number = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));

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
    }
    return false;
}

/**
 * Get omnibar prompt text from frontend context
 */
async function getOmnibarPrompt(frontendWs: WebSocket): Promise<string> {
    const prompt = await executeInTarget(frontendWs, `
        (() => {
            const omnibar = document.getElementById('sk_omnibar');
            if (!omnibar) return '';

            const promptElem = omnibar.querySelector('#sk_omnibarSearchArea span.prompt');
            return promptElem ? promptElem.textContent : '';
        })()
    `);
    return prompt || '';
}

/**
 * Close omnibar by pressing Escape
 */
async function closeOmnibar(pageWs: WebSocket): Promise<void> {
    await sendKey(pageWs, 'Escape');
    await new Promise(resolve => setTimeout(resolve, 200));
}

describe('cmd_omnibar_commands', () => {
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

    test('pressing : key opens commands omnibar', async () => {
        // Press ':' to open commands omnibar (sent to page)
        await sendKey(pageWs, ':');

        // Wait for frontend to be created
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend iframe
        const frontend = await connectToFrontend();

        // Poll for omnibar visibility in frontend context
        const omnibarVisible = await pollForOmnibarVisible(frontend);
        expect(omnibarVisible).toBe(true);
        console.log('✓ Commands omnibar opened with ":" key');

        // Verify the prompt is ':' (commands prompt)
        const prompt = await getOmnibarPrompt(frontend);
        expect(prompt).toBe(':');
        console.log('✓ Commands prompt shows ":"');

        // Close omnibar and cleanup
        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });

    test('commands omnibar displays correct prompt', async () => {
        // Open commands omnibar
        await sendKey(pageWs, ':');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend
        const frontend = await connectToFrontend();

        // Verify omnibar is visible
        const visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);

        // Check the prompt element
        const promptInfo = await executeInTarget(frontend, `
            (() => {
                const omnibar = document.getElementById('sk_omnibar');
                if (!omnibar) return { exists: false };

                const prompt = omnibar.querySelector('#sk_omnibarSearchArea>span.prompt');
                if (!prompt) return { exists: false };

                return {
                    exists: true,
                    text: prompt.textContent,
                    visible: prompt.offsetHeight > 0
                };
            })()
        `);

        expect(promptInfo.exists).toBe(true);
        expect(promptInfo.text).toBe(':');
        console.log('✓ Omnibar prompt exists with correct text: ":"');

        // Close omnibar and cleanup
        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });

    test('can open and close commands omnibar multiple times', async () => {
        // First cycle
        await sendKey(pageWs, ':');
        await new Promise(resolve => setTimeout(resolve, 500));

        let frontend = await connectToFrontend();
        let visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log('✓ Cycle 1: Commands omnibar opened');

        await closeOmnibar(pageWs);
        await closeCDP(frontend);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Second cycle
        await sendKey(pageWs, ':');
        await new Promise(resolve => setTimeout(resolve, 500));

        frontend = await connectToFrontend();
        visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log('✓ Cycle 2: Commands omnibar opened');

        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });
});
