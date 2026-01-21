/**
 * CDP Config Test - F1 Key Mapping Verification
 *
 * Tests that the external config file is loaded and F1 is mapped to show help.
 * This is a proof of concept for the 2026 migration.
 *
 * Config file: ~/surfingkeys-2026.js
 * Contents: map('<F1>', '?');
 *
 * Usage:
 *   Headless mode:   npm run test:cdp:headless tests/cdp/cdp-config-f1.test.ts
 *   Live browser:    npm run test:cdp tests/cdp/cdp-config-f1.test.ts
 */

import WebSocket from 'ws';
import * as fs from 'fs';
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
import {
    sendKey,
    sendFunctionKey,
    captureScreenshot,
    enableInputDomain
} from './utils/browser-actions';
import { CDP_PORT, getTestMode } from './cdp-config';

describe('Config F1 Key Mapping', () => {
    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';
    const CONFIG_PATH = 'file:///home/hassen/surfingkeys-2026.js';
    const SCREENSHOT_DIR = '/tmp';

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

        // Set config path in chrome.storage.local
        console.log('Setting config path:', CONFIG_PATH);
        const setResult = await executeInTarget(bgWs, `
            new Promise((resolve, reject) => {
                chrome.storage.local.set({
                    localPath: '${CONFIG_PATH}'
                }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve({ status: 'set', path: '${CONFIG_PATH}' });
                    }
                });
            })
        `);
        console.log('Config set result:', setResult);

        // Verify config path was stored
        const verifyResult = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.storage.local.get('localPath', (data) => {
                    resolve({
                        stored: data.localPath,
                        matches: data.localPath === '${CONFIG_PATH}'
                    });
                });
            })
        `);
        console.log('Config verification:', verifyResult);

        if (!verifyResult.matches) {
            throw new Error('Config path not properly stored in chrome.storage.local');
        }

        // Fetch and load the config file
        console.log('Fetching config file from:', CONFIG_PATH);
        const loadConfigResult = await executeInTarget(bgWs, `
            new Promise((resolve, reject) => {
                fetch('${CONFIG_PATH}?nonce=' + Date.now())
                    .then(r => {
                        if (!r.ok) throw new Error('Failed to fetch: ' + r.status);
                        return r.text();
                    })
                    .then(snippets => {
                        console.log('Config snippets loaded, length:', snippets.length);
                        // Store snippets in storage
                        chrome.storage.local.set({
                            snippets: snippets,
                            localPath: '${CONFIG_PATH}'
                        }, () => {
                            resolve({ status: 'loaded', length: snippets.length });
                        });
                    })
                    .catch(err => {
                        reject(new Error('Failed to load config: ' + err.message));
                    });
            })
        `);
        console.log('Config load result:', loadConfigResult);

        // Create fixture tab
        tabId = await createTab(bgWs, FIXTURE_URL, true);

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Find and connect to content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Wait for Surfingkeys to fully inject
        await new Promise(resolve => setTimeout(resolve, 1000));
    }, 40000);

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

    /**
     * Helper to check if screenshot shows help menu
     * Compare file sizes - help menu screenshots are larger
     */
    async function compareScreenshots(before: string, after: string): Promise<boolean> {
        const beforeStats = fs.statSync(before);
        const afterStats = fs.statSync(after);

        console.log(`Before: ${beforeStats.size}B, After: ${afterStats.size}B`);

        // Help menu adds visual content, so size difference should be noticeable (>10KB different)
        const sizeDifference = Math.abs(afterStats.size - beforeStats.size);
        const visible = sizeDifference > 10000; // 10KB threshold

        console.log(`Size difference: ${sizeDifference}B, Visible: ${visible}`);
        return visible;
    }

    /**
     * Helper to dismiss help menu by pressing Escape
     */
    async function dismissHelpMenu(): Promise<void> {
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    /**
     * Helper to save screenshot with timestamp
     */
    async function saveScreenshot(name: string): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const mode = getTestMode();
        const filepath = `${SCREENSHOT_DIR}/sk-${name}-${mode}-${timestamp}.png`;
        const screenshot = await captureScreenshot(pageWs);
        fs.writeFileSync(filepath, screenshot, 'base64');
        console.log(`Screenshot saved: ${filepath}`);
        return filepath;
    }

    describe('Page Setup', () => {
        test('should load correct page', async () => {
            const url = await executeInTarget(pageWs, 'window.location.href');
            expect(url).toBe(FIXTURE_URL);
        });

        test('should have Surfingkeys injected', async () => {
            // Surfingkeys uses a shadow DOM with an iframe.sk_ui
            const hasHost = await executeInTarget(pageWs, `
                (function() {
                    const allElements = document.querySelectorAll('*');
                    for (const el of allElements) {
                        if (el.shadowRoot) {
                            const iframe = el.shadowRoot.querySelector('iframe.sk_ui');
                            if (iframe) return true;
                        }
                    }
                    return false;
                })()
            `);
            expect(hasHost).toBe(true);
        });
    });

    describe('Default Help Key (?)', () => {
        test('should show help menu when pressing ?', async () => {
            // Ensure menu is closed first
            await dismissHelpMenu();
            await new Promise(resolve => setTimeout(resolve, 300));

            // Take baseline screenshot
            const beforePath = await saveScreenshot('before-question');

            // Press ? to show help
            await sendKey(pageWs, '?');
            await new Promise(resolve => setTimeout(resolve, 800));

            // Take screenshot with help menu
            const afterPath = await saveScreenshot('after-question');

            // Compare screenshots - help menu should make after screenshot noticeably larger
            const helpMenuVisible = await compareScreenshots(beforePath, afterPath);
            expect(helpMenuVisible).toBe(true);

            // Cleanup - close help menu
            await dismissHelpMenu();
        });
    });

    describe('F1 Key Mapping (from config)', () => {
        test('should show help menu when pressing F1', async () => {
            // Ensure menu is closed first
            await dismissHelpMenu();
            await new Promise(resolve => setTimeout(resolve, 300));

            // Take baseline screenshot
            const beforePath = await saveScreenshot('before-f1');

            // Press F1 to show help (via config mapping)
            await sendFunctionKey(pageWs, 'F1');
            await new Promise(resolve => setTimeout(resolve, 800));

            // Take screenshot with help menu
            const afterPath = await saveScreenshot('after-f1');

            // Compare screenshots - F1 should trigger help menu (config mapping works)
            const helpMenuVisible = await compareScreenshots(beforePath, afterPath);
            expect(helpMenuVisible).toBe(true);

            // Cleanup
            await dismissHelpMenu();
        });

        test('F1 and ? should produce same result (help menu)', async () => {
            // Test with ?
            await dismissHelpMenu();
            await new Promise(resolve => setTimeout(resolve, 300));
            const questionBeforePath = await saveScreenshot('compare-before-question');

            await sendKey(pageWs, '?');
            await new Promise(resolve => setTimeout(resolve, 800));
            const questionAfterPath = await saveScreenshot('compare-after-question');
            const questionResult = await compareScreenshots(questionBeforePath, questionAfterPath);

            await dismissHelpMenu();
            await new Promise(resolve => setTimeout(resolve, 300));

            // Test with F1
            const f1BeforePath = await saveScreenshot('compare-before-f1');

            await sendFunctionKey(pageWs, 'F1');
            await new Promise(resolve => setTimeout(resolve, 800));
            const f1AfterPath = await saveScreenshot('compare-after-f1');
            const f1Result = await compareScreenshots(f1BeforePath, f1AfterPath);

            await dismissHelpMenu();

            // Both should show help menu
            expect(questionResult).toBe(true);
            expect(f1Result).toBe(true);
        });
    });

    describe('False Positive Prevention', () => {
        test('help menu should be dismissible', async () => {
            // Show menu
            await sendKey(pageWs, '?');
            await new Promise(resolve => setTimeout(resolve, 800));
            const showBeforePath = await saveScreenshot('dismiss-before-show');

            // Dismiss menu (Escape)
            await dismissHelpMenu();
            await new Promise(resolve => setTimeout(resolve, 500));
            const dismissedPath = await saveScreenshot('dismiss-after-dismiss');

            // Verify menu was dismissed by comparing sizes (dismissed should be smaller)
            const dismissedStatsShow = fs.statSync(showBeforePath);
            const dismissedStats = fs.statSync(dismissedPath);
            const wasDismissed = dismissedStats.size < dismissedStatsShow.size - 5000; // At least 5KB smaller
            expect(wasDismissed).toBe(true);

            // Verify we can show it again (not stuck)
            await sendKey(pageWs, '?');
            await new Promise(resolve => setTimeout(resolve, 800));
            const reshowPath = await saveScreenshot('dismiss-after-reshow');

            // Reshow should be similar size to original show
            const reshowStats = fs.statSync(reshowPath);
            const reshowIsSimilar = Math.abs(reshowStats.size - dismissedStatsShow.size) < 10000;
            expect(reshowIsSimilar).toBe(true);

            await dismissHelpMenu();
        });

        test('unmapped key should not show help menu', async () => {
            await dismissHelpMenu();
            await new Promise(resolve => setTimeout(resolve, 300));

            // Take baseline
            const beforePath = await saveScreenshot('unmapped-before');

            // Press a key that is not mapped to help
            await sendKey(pageWs, 'z');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Take after screenshot
            const afterPath = await saveScreenshot('unmapped-after');

            // Unmapped key should not change screenshot much (<5KB difference)
            const beforeStats = fs.statSync(beforePath);
            const afterStats = fs.statSync(afterPath);
            const sizeDiff = Math.abs(afterStats.size - beforeStats.size);
            const noHelpMenuShown = sizeDiff < 5000; // Less than 5KB change
            expect(noHelpMenuShown).toBe(true);
        });
    });
});
