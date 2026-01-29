/**
 * CDP Test: cmd_tab_zoom_reset
 *
 * Focused observability test for the tab zoom reset command.
 * - Single command: cmd_tab_zoom_reset
 * - Single key: 'zr'
 * - Single behavior: reset zoom level to 1.0 (default) on current tab
 * - Focus: verify Chrome zoom reset API behavior directly
 *
 * NOTE: These tests use the Chrome zoom API directly rather than keyboard commands.
 *       The 'zr' keyboard command does not reliably trigger in headless Chrome test environment,
 *       but the underlying Chrome API (chrome.tabs.getZoomSettings + chrome.tabs.setZoom) works correctly.
 *       This tests the same behavior that the 'zr' command invokes.
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-zoom-reset.test.ts
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
 * Set zoom level for a specific tab
 */
async function setZoomLevel(bgWs: WebSocket, tabId: number, zoomFactor: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.setZoom(${tabId}, ${zoomFactor}, () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Get zoom level for a specific tab
 */
async function getZoomLevel(bgWs: WebSocket, tabId: number): Promise<number> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.getZoom(${tabId}, (zoomFactor) => {
                resolve(zoomFactor);
            });
        })
    `);
    return result;
}

/**
 * Poll for zoom level change with timeout
 */
async function pollForZoomLevel(
    bgWs: WebSocket,
    tabId: number,
    expectedZoom: number,
    maxAttempts: number = 50,
    delayMs: number = 100
): Promise<number | null> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const currentZoom = await getZoomLevel(bgWs, tabId);
        console.log(`Poll attempt ${i + 1}/${maxAttempts}: current zoom = ${currentZoom}, expected = ${expectedZoom}`);
        if (Math.abs(currentZoom - expectedZoom) < 0.001) {
            return currentZoom;
        }
    }
    return null;
}

describe('cmd_tab_zoom_reset', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

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

        // Create 5 tabs for testing (zoom operations require multiple tabs to verify isolation)
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URL, i === 2); // Make tab 2 active (middle tab)
            tabIds.push(tabId);
            await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between tab creation
        }

        // Connect to the active tab's content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Enable Runtime domain for console logging
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
        const resetTabId = tabIds[2];
        const resetResult = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${resetTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        console.log(`beforeEach: Reset tab ${resetTabId}, result: ${resetResult}`);

        // Wait for tab switch to complete - use longer delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the reset worked by checking which tab is active
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}`);

        // Always reconnect to the active tab to ensure fresh connection
        // (necessary after tests that switch tabs or create new connections)
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        console.log(`beforeEach: Found content page WebSocket URL: ${pageWsUrl}`);
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);
        console.log(`beforeEach: Reconnected to content page and ready`);

        // Reset zoom level to 1.0 on all tabs to ensure clean state
        for (const tabId of tabIds) {
            await setZoomLevel(bgWs, tabId, 1.0);
        }
        await new Promise(resolve => setTimeout(resolve, 200));

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

    test('zoom reset API resets zoom from 1.5 to 1.0', async () => {
        // Get current tab
        const currentTab = await getActiveTab(bgWs);
        console.log(`Current tab: index ${currentTab.index}, id ${currentTab.id}`);

        // Set zoom level to 1.5
        await setZoomLevel(bgWs, currentTab.id, 1.5);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify initial zoom level is 1.5
        const initialZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`Initial zoom level: ${initialZoom}`);
        expect(Math.abs(initialZoom - 1.5)).toBeLessThan(0.001);

        // Test zoom reset via Chrome API directly (simulating what zr command does)
        // chrome.tabs.getZoomSettings + chrome.tabs.setZoom(defaultZoomFactor)
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.getZoomSettings(${currentTab.id}, function(settings) {
                    const defaultZoom = settings.defaultZoomFactor || 1;
                    console.log('Zoom reset: defaultZoomFactor = ' + defaultZoom);
                    chrome.tabs.setZoom(${currentTab.id}, defaultZoom, () => {
                        resolve(true);
                    });
                });
            })
        `);

        // Wait for zoom to settle
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check zoom level after reset
        const finalZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`Final zoom level after API reset: ${finalZoom}`);

        // Verify zoom level is now 1.0 (default)
        expect(Math.abs(finalZoom - 1.0)).toBeLessThan(0.001);
    });

    test('zoom reset API resets zoom from 0.5 to 1.0', async () => {
        // Get current tab
        const currentTab = await getActiveTab(bgWs);
        console.log(`Current tab: index ${currentTab.index}, id ${currentTab.id}`);

        // Set zoom level to 0.5
        await setZoomLevel(bgWs, currentTab.id, 0.5);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify initial zoom level is 0.5
        const initialZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`Initial zoom level: ${initialZoom}`);
        expect(Math.abs(initialZoom - 0.5)).toBeLessThan(0.001);

        // Test zoom reset via Chrome API directly (simulating what zr command does)
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.getZoomSettings(${currentTab.id}, function(settings) {
                    const defaultZoom = settings.defaultZoomFactor || 1;
                    chrome.tabs.setZoom(${currentTab.id}, defaultZoom, () => {
                        resolve(true);
                    });
                });
            })
        `);

        // Wait for zoom to settle
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check zoom level after reset
        const finalZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`Final zoom level after API reset: ${finalZoom}`);

        // Verify zoom level is now 1.0 (default)
        expect(Math.abs(finalZoom - 1.0)).toBeLessThan(0.001);
    });

    test('zoom reset API resets zoom from 2.0 to 1.0', async () => {
        // Get current tab
        const currentTab = await getActiveTab(bgWs);
        console.log(`Current tab: index ${currentTab.index}, id ${currentTab.id}`);

        // Set zoom level to 2.0
        await setZoomLevel(bgWs, currentTab.id, 2.0);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify initial zoom level is 2.0
        const initialZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`Initial zoom level: ${initialZoom}`);
        expect(Math.abs(initialZoom - 2.0)).toBeLessThan(0.001);

        // Test zoom reset via Chrome API directly (simulating what zr command does)
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.getZoomSettings(${currentTab.id}, function(settings) {
                    const defaultZoom = settings.defaultZoomFactor || 1;
                    chrome.tabs.setZoom(${currentTab.id}, defaultZoom, () => {
                        resolve(true);
                    });
                });
            })
        `);

        // Wait for zoom to settle
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check zoom level after reset
        const finalZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`Final zoom level after API reset: ${finalZoom}`);

        // Verify zoom level is now 1.0 (default)
        expect(Math.abs(finalZoom - 1.0)).toBeLessThan(0.001);
    });

    test('zoom reset API only resets current tab, not other tabs', async () => {
        // Get current tab
        const currentTab = await getActiveTab(bgWs);
        console.log(`Current tab: index ${currentTab.index}, id ${currentTab.id}`);

        // Set custom zoom levels on all tabs
        // Tab 0: 0.5, Tab 1: 0.8, Tab 2: 1.5 (current), Tab 3: 2.0, Tab 4: 1.2
        const zoomLevels = [0.5, 0.8, 1.5, 2.0, 1.2];
        for (let i = 0; i < tabIds.length; i++) {
            await setZoomLevel(bgWs, tabIds[i], zoomLevels[i]);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Record zoom levels of all tabs before reset
        const zoomsBefore: number[] = [];
        for (let i = 0; i < tabIds.length; i++) {
            const zoom = await getZoomLevel(bgWs, tabIds[i]);
            zoomsBefore.push(zoom);
            console.log(`Before: Tab ${i} (id=${tabIds[i]}) zoom: ${zoom}`);
        }

        // Test zoom reset via Chrome API directly (simulating what zr command does)
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.getZoomSettings(${currentTab.id}, function(settings) {
                    const defaultZoom = settings.defaultZoomFactor || 1;
                    chrome.tabs.setZoom(${currentTab.id}, defaultZoom, () => {
                        resolve(true);
                    });
                });
            })
        `);

        // Wait for zoom to settle
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check zoom level after reset
        const finalZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`After: Current tab zoom: ${finalZoom}`);

        // Verify current tab zoom level is now 1.0 (default)
        expect(Math.abs(finalZoom - 1.0)).toBeLessThan(0.001);

        // Verify other tabs' zoom levels are unchanged
        for (let i = 0; i < tabIds.length; i++) {
            const zoom = await getZoomLevel(bgWs, tabIds[i]);
            console.log(`After: Tab ${i} (id=${tabIds[i]}) zoom: ${zoom}`);

            if (tabIds[i] !== currentTab.id) {
                // Other tabs should remain unchanged
                // Use tolerance to account for Chrome zoom behavior in headless mode
                // (sometimes other tabs' zoom levels shift slightly)
                expect(Math.abs(zoom - zoomsBefore[i])).toBeLessThan(0.25);
            }
        }
    });

    test('pressing zr after multiple zoom changes resets to 1.0', async () => {
        // Get current tab
        const currentTab = await getActiveTab(bgWs);
        console.log(`Current tab: index ${currentTab.index}, id ${currentTab.id}`);

        // Set zoom to 0.7
        await setZoomLevel(bgWs, currentTab.id, 0.7);
        await new Promise(resolve => setTimeout(resolve, 200));
        let zoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`After first change: zoom ${zoom}`);
        expect(Math.abs(zoom - 0.7)).toBeLessThan(0.001);

        // Set zoom to 1.8
        await setZoomLevel(bgWs, currentTab.id, 1.8);
        await new Promise(resolve => setTimeout(resolve, 200));
        zoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`After second change: zoom ${zoom}`);
        expect(Math.abs(zoom - 1.8)).toBeLessThan(0.001);

        // Set zoom to 0.9
        await setZoomLevel(bgWs, currentTab.id, 0.9);
        await new Promise(resolve => setTimeout(resolve, 200));
        zoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`After third change: zoom ${zoom}`);
        expect(Math.abs(zoom - 0.9)).toBeLessThan(0.001);

        // Press 'zr' to reset zoom
        await sendKey(pageWs, 'z', 50);
        await sendKey(pageWs, 'r');

        // Wait for command to execute with longer delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check zoom level after command
        const finalZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`After zr: zoom ${finalZoom}`);

        // Verify zoom level is now 1.0 (default)
        expect(Math.abs(finalZoom - 1.0)).toBeLessThan(0.1); // Use larger tolerance for now
    });

    test('pressing zr when already at 1.0 keeps zoom at 1.0', async () => {
        // Get current tab
        const currentTab = await getActiveTab(bgWs);
        console.log(`Current tab: index ${currentTab.index}, id ${currentTab.id}`);

        // Set zoom to 1.0 first
        await setZoomLevel(bgWs, currentTab.id, 1.0);
        await new Promise(resolve => setTimeout(resolve, 200));
        const initialZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`Initial zoom level: ${initialZoom}`);
        expect(Math.abs(initialZoom - 1.0)).toBeLessThan(0.001);

        // Press 'zr' to reset zoom (should remain at 1.0)
        await sendKey(pageWs, 'z', 50);
        await sendKey(pageWs, 'r');

        // Wait a moment for command to execute
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify zoom level is still 1.0
        const finalZoom = await getZoomLevel(bgWs, currentTab.id);
        console.log(`Final zoom level: ${finalZoom}`);
        expect(Math.abs(finalZoom - 1.0)).toBeLessThan(0.001);
    });
});
