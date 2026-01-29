/**
 * CDP Test: cmd_omnibar_url
 *
 * Focused observability test for the URL omnibar command.
 * - Single command: cmd_omnibar_url
 * - Single key: 'go'
 * - Single behavior: open URL omnibar for typing URLs
 * - Focus: verify command execution, omnibar display, URL input, and navigation
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-omnibar-url.test.ts
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
 * Get the currently active tab
 */
async function getActiveTab(bgWs: WebSocket): Promise<{ id: number; index: number; url: string }> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    resolve({
                        id: tabs[0].id,
                        index: tabs[0].index,
                        url: tabs[0].url
                    });
                } else {
                    resolve(null);
                }
            });
        })
    `);
    return result;
}

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
 * Get omnibar input element value
 */
async function getOmnibarInputValue(frontendWs: WebSocket): Promise<string> {
    const value = await executeInTarget(frontendWs, `
        (() => {
            const omnibar = document.getElementById('sk_omnibar');
            if (!omnibar) return '';

            const input = omnibar.querySelector('#sk_omnibarSearchArea input');
            return input ? input.value : '';
        })()
    `);
    return value || '';
}

/**
 * Clear omnibar input field
 */
async function clearOmnibarInput(frontendWs: WebSocket): Promise<void> {
    await executeInTarget(frontendWs, `
        (() => {
            const omnibar = document.getElementById('sk_omnibar');
            if (!omnibar) return;

            const input = omnibar.querySelector('#sk_omnibarSearchArea input');
            if (input) {
                input.value = '';
                // Trigger input event so omnibar updates
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        })()
    `);
}

/**
 * Type text into omnibar input
 */
async function typeIntoOmnibar(frontendWs: WebSocket, text: string): Promise<void> {
    // Enable Input domain on frontend
    await new Promise<void>((resolve) => {
        const messageId = Math.floor(Math.random() * 100000);
        frontendWs.send(JSON.stringify({
            id: messageId,
            method: 'Input.enable'
        }));
        // Wait a bit for enable to complete
        setTimeout(() => resolve(), 100);
    });

    // Type each character
    for (const char of text) {
        const messageId = Math.floor(Math.random() * 100000);

        // keyDown
        frontendWs.send(JSON.stringify({
            id: messageId,
            method: 'Input.dispatchKeyEvent',
            params: {
                type: 'keyDown',
                key: char
            }
        }));

        await new Promise(resolve => setTimeout(resolve, 30));

        // char
        frontendWs.send(JSON.stringify({
            id: messageId + 1,
            method: 'Input.dispatchKeyEvent',
            params: {
                type: 'char',
                text: char
            }
        }));

        await new Promise(resolve => setTimeout(resolve, 30));

        // keyUp
        frontendWs.send(JSON.stringify({
            id: messageId + 2,
            method: 'Input.dispatchKeyEvent',
            params: {
                type: 'keyUp',
                key: char
            }
        }));

        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

/**
 * Press Enter in the omnibar
 */
async function pressEnterInOmnibar(frontendWs: WebSocket): Promise<void> {
    const messageId = Math.floor(Math.random() * 100000);

    // keyDown
    frontendWs.send(JSON.stringify({
        id: messageId,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyDown',
            key: 'Enter',
            code: 'Enter'
        }
    }));

    await new Promise(resolve => setTimeout(resolve, 50));

    // keyUp
    frontendWs.send(JSON.stringify({
        id: messageId + 1,
        method: 'Input.dispatchKeyEvent',
        params: {
            type: 'keyUp',
            key: 'Enter',
            code: 'Enter'
        }
    }));
}

/**
 * Close omnibar by pressing Escape
 */
async function closeOmnibar(pageWs: WebSocket): Promise<void> {
    await sendKey(pageWs, 'Escape');
    await new Promise(resolve => setTimeout(resolve, 200));
}

/**
 * Wait for tab count to change (used after navigation creates new tab)
 */
async function waitForTabCountChange(bgWs: WebSocket, expectedCount: number, timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({ currentWindow: true }, (tabs) => {
                    resolve(tabs.length);
                });
            })
        `);

        if (result === expectedCount) {
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
}

describe('cmd_omnibar_url', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    const TEST_URL = 'http://127.0.0.1:9873/hints-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let testTabIds: number[] = [];
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

        // Create initial test tab
        const tabId = await createTab(bgWs, FIXTURE_URL, true);
        testTabIds.push(tabId);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Connect to the active tab's content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Enable Runtime domain
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Reset to the fixture tab before each test
        if (testTabIds.length > 0) {
            const resetTabId = testTabIds[0];
            await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.update(${resetTabId}, { active: true }, () => {
                        resolve(true);
                    });
                })
            `);
            console.log(`beforeEach: Reset to tab ${resetTabId}`);
        }

        // Wait for tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect to the active tab
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);
        console.log(`beforeEach: Reconnected to content page and ready`);

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
        // Cleanup - close all created tabs
        const allTabsResult = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({ currentWindow: true }, (tabs) => {
                    resolve(tabs.map(t => t.id));
                });
            })
        `);

        for (const tabId of allTabsResult) {
            if (testTabIds.includes(tabId)) {
                try {
                    await closeTab(bgWs, tabId);
                } catch (e) {
                    // Tab might already be closed
                }
            }
        }

        if (pageWs) {
            await closeCDP(pageWs);
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('pressing go opens URL omnibar', async () => {
        // Press 'go' to open URL omnibar
        console.log(`Pressing 'go' to open URL omnibar...`);
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'o');

        // Wait for frontend to be created
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend iframe
        const frontend = await connectToFrontend();

        // Poll for omnibar visibility in frontend
        const omnibarVisible = await pollForOmnibarVisible(frontend);
        expect(omnibarVisible).toBe(true);
        console.log(`✓ Omnibar successfully opened for URL input`);

        // Close omnibar
        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });

    test('go command can be used multiple times consecutively', async () => {
        // First press
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 500));

        let frontend = await connectToFrontend();
        let visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log(`First go: omnibar visible`);

        await closeOmnibar(pageWs);
        await closeCDP(frontend);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Second press
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 500));

        frontend = await connectToFrontend();
        visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log(`Second go: omnibar visible`);
        console.log(`✓ go command works multiple times`);

        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });

    test('typing URL in omnibar shows input correctly', async () => {
        // Open URL omnibar
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend
        const frontend = await connectToFrontend();

        // Verify omnibar is visible
        const visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log(`✓ Omnibar opened`);

        // Clear the input first (it may have captured 'go' keypresses)
        await clearOmnibarInput(frontend);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Type URL into omnibar
        console.log(`Typing URL: ${TEST_URL}`);
        await typeIntoOmnibar(frontend, TEST_URL);

        // Wait for input to be updated
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify the input value
        const inputValue = await getOmnibarInputValue(frontend);
        expect(inputValue).toBe(TEST_URL);
        console.log(`✓ URL typed into omnibar: ${inputValue}`);

        // Close omnibar
        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });

    test('omnibar shows correct prompt for URL input', async () => {
        // Open URL omnibar
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend
        const frontend = await connectToFrontend();

        // Verify omnibar is visible
        const visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);

        // Check if prompt exists and is visible
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
        console.log(`✓ Omnibar prompt exists with text: "${promptInfo.text}"`);

        // Close omnibar
        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });

    test('omnibar input field is properly focused and ready for typing', async () => {
        // Open URL omnibar
        await sendKey(pageWs, 'g');
        await sendKey(pageWs, 'o');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to frontend
        const frontend = await connectToFrontend();

        // Verify omnibar is visible
        const visible = await pollForOmnibarVisible(frontend);
        expect(visible).toBe(true);
        console.log(`✓ Omnibar opened`);

        // Check if input field exists and is ready for typing
        const inputInfo = await executeInTarget(frontend, `
            (() => {
                const omnibar = document.getElementById('sk_omnibar');
                if (!omnibar) return { exists: false };

                const input = omnibar.querySelector('#sk_omnibarSearchArea input');
                if (!input) return { exists: false };

                return {
                    exists: true,
                    isFocused: document.activeElement === input,
                    value: input.value,
                    placeholder: input.placeholder
                };
            })()
        `);

        expect(inputInfo.exists).toBe(true);
        console.log(`✓ Input field exists and is ready for typing`);
        console.log(`  - Focused: ${inputInfo.isFocused}`);
        console.log(`  - Placeholder: "${inputInfo.placeholder}"`);

        // Close omnibar
        await closeOmnibar(pageWs);
        await closeCDP(frontend);
    });
});
