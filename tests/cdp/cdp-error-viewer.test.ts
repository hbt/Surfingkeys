/**
 * CDP Error Viewer Test - Error Logging and Viewer Verification
 *
 * Tests the complete error logging and viewing system:
 * 1. Verifies error handlers are installed
 * 2. Triggers test errors in content script
 * 3. Verifies errors are captured and stored
 * 4. Opens error viewer page
 * 5. Verifies errors are displayed correctly
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/cdp-error-viewer.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/cdp-error-viewer.test.ts
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
import { CDP_PORT } from './cdp-config';

describe('Error Logging and Viewer', () => {
    let bgWs: WebSocket;
    let extensionId: string;
    let testTabId: number;
    let viewerTabId: number;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';

    beforeAll(async () => {
        // Check CDP is available
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        // Connect to background or frontend (for chrome.storage access)
        try {
            const bgInfo = await findExtensionBackground();
            extensionId = bgInfo.extensionId;
            bgWs = await connectToCDP(bgInfo.wsUrl);
        } catch (e) {
            // Fallback to frontend.html if background not found (MV3 service worker may be inactive)
            const frontendUrl = await findContentPage('frontend.html');
            bgWs = await connectToCDP(frontendUrl);

            // Get extension ID from the URL
            const match = frontendUrl.match(/chrome-extension:\/\/([a-z]+)\//);
            if (match) {
                extensionId = match[1];
            } else {
                throw new Error('Could not determine extension ID');
            }
        }
    });

    afterAll(async () => {
        // Cleanup tabs
        if (testTabId) await closeTab(bgWs, testTabId).catch(() => {});
        if (viewerTabId) await closeTab(bgWs, viewerTabId).catch(() => {});

        // Close connections
        await closeCDP(bgWs);
    });

    test('should clear previous errors', async () => {
        await executeInTarget(bgWs, `
            new Promise(r => {
                chrome.storage.local.set({ surfingkeys_errors: [] }, () => r(true));
            })
        `);

        const errors = await executeInTarget(bgWs, `
            new Promise(r => {
                chrome.storage.local.get(['surfingkeys_errors'], (result) => {
                    r(result.surfingkeys_errors || []);
                });
            })
        `);

        expect(Array.isArray(errors)).toBe(true);
        expect(errors.length).toBe(0);
    });

    test('should have error handlers installed', async () => {
        // Create test page
        testTabId = await createTab(bgWs, FIXTURE_URL, true);
        await new Promise(r => setTimeout(r, 1500)); // Wait for page load

        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
        const pageWs = await connectToCDP(pageWsUrl);

        const handlersInstalled = await executeInTarget(pageWs, `
            typeof window._surfingkeysErrorHandlersInstalled !== 'undefined' &&
            window._surfingkeysErrorHandlersInstalled
        `);

        await closeCDP(pageWs);

        expect(handlersInstalled).toBe(true);
    });

    test('should capture triggered errors', async () => {
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
        const pageWs = await connectToCDP(pageWsUrl);

        // Trigger test errors
        await executeInTarget(pageWs, `
            (async function() {
                // Trigger error
                setTimeout(() => {
                    throw new Error('TEST_ERROR: Content script test error');
                }, 100);

                await new Promise(r => setTimeout(r, 200));

                // Trigger rejection
                Promise.reject(new Error('TEST_REJECTION: Content script promise rejection'));

                return 'errors_triggered';
            })();
        `);

        await new Promise(r => setTimeout(r, 1000)); // Wait for errors to be captured
        await closeCDP(pageWs);

        // Verify errors were captured
        const errors = await executeInTarget(bgWs, `
            new Promise(r => {
                chrome.storage.local.get(['surfingkeys_errors'], (result) => {
                    r(result.surfingkeys_errors || []);
                });
            })
        `);

        expect(Array.isArray(errors)).toBe(true);
        expect(errors.length).toBeGreaterThanOrEqual(2);

        const hasTestError = errors.some((e: any) =>
            e.message && e.message.includes('TEST_ERROR')
        );
        const hasTestRejection = errors.some((e: any) =>
            e.message && e.message.includes('TEST_REJECTION')
        );

        expect(hasTestError).toBe(true);
        expect(hasTestRejection).toBe(true);
    });

    test('should display errors in error viewer page', async () => {
        const viewerUrl = `chrome-extension://${extensionId}/pages/error-viewer.html`;

        // Open error viewer
        viewerTabId = await createTab(bgWs, viewerUrl, true);
        await new Promise(r => setTimeout(r, 2000)); // Wait for viewer to load

        // Find error viewer page
        const viewerWsUrl = await findContentPage('error-viewer.html');
        expect(viewerWsUrl).toBeTruthy();

        const viewerWs = await connectToCDP(viewerWsUrl);

        // Check if errors are displayed in DOM
        const displayedErrors = await executeInTarget(viewerWs, `
            document.querySelectorAll('.error-item').length
        `);

        expect(displayedErrors).toBeGreaterThanOrEqual(2);

        // Verify error viewer stats
        const statsText = await executeInTarget(viewerWs, `
            document.getElementById('error-viewer-stats').textContent
        `);

        expect(statsText).toContain('error');

        await closeCDP(viewerWs);
    });
});
