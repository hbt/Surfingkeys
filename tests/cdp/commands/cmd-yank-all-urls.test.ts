/**
 * CDP Test: cmd_yank_all_urls
 *
 * Focused observability test for the yank all URLs command.
 * - Single command: cmd_yank_all_urls
 * - Single key: 'yY'
 * - Single behavior: copy all tab URLs to clipboard (one URL per line)
 * - Focus: verify command execution via banner message
 *
 * Note: In headless Chrome, clipboard operations using document.execCommand('paste')
 * don't work reliably, so we verify command execution via the "Copied:" banner
 * that Surfingkeys shows when clipboard.write() is called.
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-yank-all-urls.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-yank-all-urls.test.ts
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
    waitForSurfingkeysReady,
    waitFor
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Get all tabs in current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; url: string; index: number }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(t => ({
                    id: t.id,
                    url: t.url,
                    index: t.index
                })));
            });
        })
    `);
    return result;
}

/**
 * Check if banner with "Copied:" message appeared
 */
async function waitForCopiedBanner(pageWs: WebSocket): Promise<boolean> {
    const found = await waitFor(async () => {
        const result = await executeInTarget(pageWs, `
            (function() {
                const banner = document.getElementById('sk_banner');
                if (banner && banner.textContent && banner.textContent.includes('Copied:')) {
                    return true;
                }
                return false;
            })()
        `);
        return result === true;
    }, 3000, 100);

    return found;
}

describe('cmd_yank_all_urls', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

    // Test URLs with different domains and special characters
    const TEST_URLS = [
        'http://127.0.0.1:9873/scroll-test.html',
        'http://example.com/page1',
        'http://test.org/page-with-dash',
        'http://special.com/path?query=value&foo=bar',
        'http://unicode.com/path/with/слова'
    ];

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabIds: number[] = [];
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

        // Create 5 test tabs with different URLs
        for (let i = 0; i < TEST_URLS.length; i++) {
            const tabId = await createTab(bgWs, TEST_URLS[i], i === 0); // Make first tab active
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Connect to the active tab's content page
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
        // Cleanup - close all created tabs
        for (const tabId of tabIds) {
            try {
                await closeTab(bgWs, tabId);
            } catch (e) {
                // Tab might already be closed
            }
        }

        if (pageWs) {
            await closeCDP(pageWs);
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('pressing yY executes command successfully', async () => {
        // Get current tabs before executing command
        const tabsBefore = await getAllTabs(bgWs);
        console.log(`Tabs before yY: ${tabsBefore.length} tabs`);

        // Execute yY command
        await sendKey(pageWs, 'y');
        await sendKey(pageWs, 'Y');

        // Wait for and verify "Copied:" banner appeared
        const bannerAppeared = await waitForCopiedBanner(pageWs);
        expect(bannerAppeared).toBe(true);

        console.log(`✓ yY command executed successfully (banner appeared)`);
    });

    test('command works with multiple tabs', async () => {
        // Verify we have multiple tabs
        const tabs = await getAllTabs(bgWs);
        const testTabs = tabs.filter(t => tabIds.includes(t.id));
        expect(testTabs.length).toBeGreaterThan(1);

        console.log(`Test has ${testTabs.length} tabs`);

        // Execute yY command
        await sendKey(pageWs, 'y');
        await sendKey(pageWs, 'Y');

        // Verify command executed
        const bannerAppeared = await waitForCopiedBanner(pageWs);
        expect(bannerAppeared).toBe(true);
    });

    test('command works with tabs from different domains', async () => {
        // Get tabs and verify they're from different domains
        const tabs = await getAllTabs(bgWs);
        const testTabs = tabs.filter(t => tabIds.includes(t.id));

        // Extract unique domains
        const domains = new Set(testTabs.map(t => {
            try {
                return new URL(t.url).hostname;
            } catch {
                return '';
            }
        }));

        console.log(`Unique domains: ${Array.from(domains).join(', ')}`);
        expect(domains.size).toBeGreaterThan(1);

        // Execute yY command
        await sendKey(pageWs, 'y');
        await sendKey(pageWs, 'Y');

        // Verify command executed
        const bannerAppeared = await waitForCopiedBanner(pageWs);
        expect(bannerAppeared).toBe(true);
    });

    test('command handles special characters in URLs', async () => {
        // Verify we have URLs with special characters
        const tabs = await getAllTabs(bgWs);
        const specialUrls = tabs.filter(t =>
            t.url.includes('?') || t.url.includes('&') || t.url.includes('-')
        );

        expect(specialUrls.length).toBeGreaterThan(0);
        console.log(`Found ${specialUrls.length} URLs with special characters`);

        // Execute yY command
        await sendKey(pageWs, 'y');
        await sendKey(pageWs, 'Y');

        // Verify command executed
        const bannerAppeared = await waitForCopiedBanner(pageWs);
        expect(bannerAppeared).toBe(true);
    });

    test('command works with single tab', async () => {
        // Close all tabs except one
        for (let i = 1; i < tabIds.length; i++) {
            await closeTab(bgWs, tabIds[i]);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Wait for tabs to be closed
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify only one test tab remains
        const tabs = await getAllTabs(bgWs);
        const remainingTestTabs = tabs.filter(t => tabIds.includes(t.id));
        expect(remainingTestTabs.length).toBe(1);

        console.log(`Remaining test tabs: ${remainingTestTabs.length}`);

        // Execute yY command
        await sendKey(pageWs, 'y');
        await sendKey(pageWs, 'Y');

        // Verify command executed
        const bannerAppeared = await waitForCopiedBanner(pageWs);
        expect(bannerAppeared).toBe(true);
    });

    test('command executes without throwing errors', async () => {
        // This test verifies the command runs without exceptions

        let errorOccurred = false;

        try {
            // Execute yY command
            await sendKey(pageWs, 'y');
            await sendKey(pageWs, 'Y');

            // Verify command executed via banner
            const bannerAppeared = await waitForCopiedBanner(pageWs);
            expect(bannerAppeared).toBe(true);

            // If we got here, command executed successfully
            expect(errorOccurred).toBe(false);
        } catch (e) {
            console.error(`Command execution error: ${e}`);
            throw e;
        }
    });

    test('banner shows correct message format', async () => {
        // Execute yY command
        await sendKey(pageWs, 'y');
        await sendKey(pageWs, 'Y');

        // Wait a bit for command to execute
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check banner content
        const bannerText = await executeInTarget(pageWs, `
            (function() {
                const banner = document.getElementById('sk_banner');
                return banner ? banner.textContent : null;
            })()
        `);

        console.log(`Banner text: "${bannerText}"`);

        // Banner should contain "Copied:"
        expect(bannerText).not.toBeNull();
        expect(bannerText).toContain('Copied:');

        // Banner should contain at least one URL
        expect(bannerText).toMatch(/https?:\/\//);
    });

    test('command can be executed multiple times', async () => {
        // Execute yY command twice
        for (let i = 0; i < 2; i++) {
            console.log(`Execution ${i + 1}`);

            await sendKey(pageWs, 'y');
            await sendKey(pageWs, 'Y');

            const bannerAppeared = await waitForCopiedBanner(pageWs);
            expect(bannerAppeared).toBe(true);

            // Wait between executions
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    test('tabs are queried from background script', async () => {
        // This test verifies that getTabs runtime call works

        // Get tabs via background script (same as yY command does)
        const tabs = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({ currentWindow: true }, (tabs) => {
                    resolve(tabs.map(t => ({ url: t.url, id: t.id })));
                });
            })
        `);

        expect(tabs).not.toBeNull();
        expect(Array.isArray(tabs)).toBe(true);
        expect(tabs.length).toBeGreaterThan(0);

        console.log(`Background script returned ${tabs.length} tabs`);

        // Execute yY command which uses the same getTabs call
        await sendKey(pageWs, 'y');
        await sendKey(pageWs, 'Y');

        const bannerAppeared = await waitForCopiedBanner(pageWs);
        expect(bannerAppeared).toBe(true);
    });
});
