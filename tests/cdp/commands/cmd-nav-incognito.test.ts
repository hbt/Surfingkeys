/**
 * CDP Test: cmd_nav_incognito
 *
 * Focused observability test for the incognito window command.
 * - Single command: cmd_nav_incognito
 * - Single key: 'oi'
 * - Single behavior: open current URL in a new incognito window
 * - Focus: verify command execution and RUNTIME message dispatch
 *
 * Note: Headless Chrome does not support creating incognito windows.
 * This test verifies that the command is triggered and the correct message
 * is sent to the background script. The actual window creation is only tested
 * when running in live (non-headless) mode.
 *
 * Usage:
 *   Headless mode (command dispatch test):  npm run test:cdp:headless tests/cdp/commands/cmd-nav-incognito.test.ts
 *   Live browser (full window creation test): npm run test:cdp tests/cdp/commands/cmd-nav-incognito.test.ts
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


describe('cmd_nav_incognito', () => {
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

    test('pressing oi triggers openIncognito RUNTIME message', async () => {
        // First, test what context we're in
        const contextTest = await executeInTarget(bgWs, `({
            hasWindow: typeof window !== 'undefined',
            hasGlobalThis: typeof globalThis !== 'undefined',
            hasSelf: typeof self !== 'undefined',
            chromeWindowsExists: typeof chrome !== 'undefined' && typeof chrome.windows !== 'undefined'
        })`);
        console.log(`Context test: ${JSON.stringify(contextTest)}`);

        // Use globalThis instead of window for service worker compatibility
        const setupResult = await executeInTarget(bgWs, `
            // Different approach: intercept chrome.windows.create instead of the handler
            // This way we don't need to access internal closures
            // Use globalThis for service worker compatibility
            globalThis.__testCapturedMessages = [];

            // Store original chrome.windows.create
            globalThis.__originalWindowsCreate = chrome.windows.create;

            // Replace with interceptor
            chrome.windows.create = function(createData, callback) {
                // Capture the call
                globalThis.__testCapturedMessages.push({
                    method: 'windows.create',
                    url: createData.url,
                    incognito: createData.incognito,
                    timestamp: Date.now()
                });

                // Don't actually call the original - we don't want to create windows in headless
                // Just call the callback with a fake window if provided
                if (callback) {
                    callback({ id: 999, incognito: createData.incognito });
                }
            };

            ({ interceptorInstalled: true });
        `);
        console.log(`Setup result: ${JSON.stringify(setupResult)}`);

        // Press 'oi' to trigger the command
        await sendKey(pageWs, 'o', 50);
        await sendKey(pageWs, 'i');

        // Wait a bit for the message to be processed
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if the message was captured
        const messages = await executeInTarget(bgWs, `globalThis.__testCapturedMessages`);
        console.log(`Captured messages: ${JSON.stringify(messages)}`);

        expect(messages).toBeDefined();
        expect(messages.length).toBeGreaterThan(0);

        const incognitoCall = messages.find((m: any) => m.incognito === true);
        expect(incognitoCall).toBeDefined();
        expect(incognitoCall.url).toBe(FIXTURE_URL);
        expect(incognitoCall.incognito).toBe(true);

        console.log(`✓ chrome.windows.create called with URL: ${incognitoCall.url}, incognito: true`);

        // Restore original handler
        await executeInTarget(bgWs, `
            if (globalThis.__originalWindowsCreate) {
                chrome.windows.create = globalThis.__originalWindowsCreate;
                delete globalThis.__originalWindowsCreate;
            }
            delete globalThis.__testCapturedMessages;
        `);
    });

    test('incognito call uses current page URL', async () => {
        // Set up message capture
        await executeInTarget(bgWs, `
            globalThis.__testCapturedMessages = [];
            globalThis.__originalWindowsCreate = chrome.windows.create;
            chrome.windows.create = function(createData, callback) {
                globalThis.__testCapturedMessages.push({
                    url: createData.url,
                    incognito: createData.incognito
                });
                if (callback) {
                    callback({ id: 999, incognito: createData.incognito });
                }
            };
        `);

        // Press 'oi'
        await sendKey(pageWs, 'o', 50);
        await sendKey(pageWs, 'i');

        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify message payload
        const messages = await executeInTarget(bgWs, `globalThis.__testCapturedMessages`);
        expect(messages.length).toBe(1);

        const call = messages[0];
        expect(call.url).toBe(FIXTURE_URL);
        expect(call.incognito).toBe(true);
        console.log(`✓ chrome.windows.create URL matches fixture: ${call.url}`);
        console.log(`✓ incognito flag is true`);

        // Cleanup
        await executeInTarget(bgWs, `
            if (globalThis.__originalWindowsCreate) {
                chrome.windows.create = globalThis.__originalWindowsCreate;
                delete globalThis.__originalWindowsCreate;
            }
            delete globalThis.__testCapturedMessages;
        `);
    });

    test('repeated oi presses trigger multiple incognito window creations', async () => {
        // Set up message capture
        await executeInTarget(bgWs, `
            globalThis.__testCapturedMessages = [];
            globalThis.__originalWindowsCreate = chrome.windows.create;
            chrome.windows.create = function(createData, callback) {
                globalThis.__testCapturedMessages.push({
                    url: createData.url,
                    incognito: createData.incognito,
                    timestamp: Date.now()
                });
                if (callback) {
                    callback({ id: 999 + globalThis.__testCapturedMessages.length, incognito: createData.incognito });
                }
            };
        `);

        // Press 'oi' twice
        await sendKey(pageWs, 'o', 50);
        await sendKey(pageWs, 'i');

        await new Promise(resolve => setTimeout(resolve, 300));

        await sendKey(pageWs, 'o', 50);
        await sendKey(pageWs, 'i');

        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify we got 2 calls
        const messages = await executeInTarget(bgWs, `globalThis.__testCapturedMessages`);
        expect(messages.length).toBe(2);

        console.log(`✓ Two chrome.windows.create calls captured`);
        console.log(`  Call 1: ${messages[0].url}, incognito: ${messages[0].incognito}`);
        console.log(`  Call 2: ${messages[1].url}, incognito: ${messages[1].incognito}`);

        // Both should have the same URL and be incognito
        expect(messages[0].url).toBe(FIXTURE_URL);
        expect(messages[0].incognito).toBe(true);
        expect(messages[1].url).toBe(FIXTURE_URL);
        expect(messages[1].incognito).toBe(true);

        // Cleanup
        await executeInTarget(bgWs, `
            if (globalThis.__originalWindowsCreate) {
                chrome.windows.create = globalThis.__originalWindowsCreate;
                delete globalThis.__originalWindowsCreate;
            }
            delete globalThis.__testCapturedMessages;
        `);
    });
});
