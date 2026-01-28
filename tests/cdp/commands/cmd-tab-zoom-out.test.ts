/**
 * CDP Test: cmd_tab_zoom_out
 *
 * Focused observability test for the tab zoom out command.
 * - Single command: cmd_tab_zoom_out
 * - Single key: 'zo'
 * - Single behavior: decrease zoom level on current tab
 * - Focus: verify command execution and zoom level changes without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-zoom-out.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-tab-zoom-out.test.ts
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
 * Get zoom level for a specific tab
 */
async function getTabZoom(bgWs: WebSocket, tabId: number): Promise<number> {
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
 * Set zoom level for a specific tab
 */
async function setTabZoom(bgWs: WebSocket, tabId: number, zoomFactor: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.setZoom(${tabId}, ${zoomFactor}, () => {
                resolve(true);
            });
        })
    `);
}

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
 * Poll for zoom level change
 */
async function waitForZoomChange(
    bgWs: WebSocket,
    tabId: number,
    initialZoom: number,
    maxAttempts: number = 30,
    delayMs: number = 200
): Promise<number | null> {
    console.log(`waitForZoomChange: polling for change from ${initialZoom}`);
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const currentZoom = await getTabZoom(bgWs, tabId);
        console.log(`  Poll ${i + 1}/${maxAttempts}: zoom = ${currentZoom}`);
        if (Math.abs(currentZoom - initialZoom) > 0.001) {
            console.log(`  Zoom changed! ${initialZoom} -> ${currentZoom}`);
            return currentZoom;
        }
    }
    console.log(`  Timeout: zoom still ${await getTabZoom(bgWs, tabId)} after ${maxAttempts} attempts`);
    return null;
}

describe('cmd_tab_zoom_out', () => {
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

        // Create 5 tabs for testing (zoom should only affect current tab)
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

        // Wait for tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reset zoom level to 1.0 on all tabs
        for (const tabId of tabIds) {
            await setTabZoom(bgWs, tabId, 1.0);
        }

        // Wait for zoom reset to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify the reset worked
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}`);

        const verifyZoom = await getTabZoom(bgWs, verifyTab.id);
        console.log(`beforeEach: Zoom level reset to ${verifyZoom}`);

        // Always reconnect to the active tab to ensure fresh connection
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

    test('pressing zo decreases zoom level', async () => {
        // Get active tab
        const activeTab = await getActiveTab(bgWs);
        console.log(`Active tab: index ${activeTab.index}, id ${activeTab.id}`);

        // Get initial zoom level
        const initialZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Initial zoom: ${initialZoom}`);

        // Press 'zo' to zoom out
        await sendKey(pageWs, 'z', 50);
        await sendKey(pageWs, 'o');

        // Poll for zoom change
        const newZoom = await waitForZoomChange(bgWs, activeTab.id, initialZoom);

        expect(newZoom).not.toBeNull();
        console.log(`After zo: zoom ${newZoom}`);

        // Verify zoom decreased (should be 0.1 lower)
        expect(newZoom).toBeLessThan(initialZoom);
        expect(newZoom).toBeCloseTo(initialZoom - 0.1, 2);
    });

    test('pressing zo twice decreases zoom twice', async () => {
        const activeTab = await getActiveTab(bgWs);
        const initialZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Initial zoom: ${initialZoom}`);

        // First zo
        await sendKey(pageWs, 'z', 50);
        await sendKey(pageWs, 'o');

        // Poll for first zoom change
        const afterFirstZoom = await waitForZoomChange(bgWs, activeTab.id, initialZoom);
        expect(afterFirstZoom).not.toBeNull();
        console.log(`After first zo: zoom ${afterFirstZoom}`);

        // Second zo
        await sendKey(pageWs, 'z', 50);
        await sendKey(pageWs, 'o');

        // Poll for second zoom change
        const afterSecondZoom = await waitForZoomChange(bgWs, activeTab.id, afterFirstZoom);
        expect(afterSecondZoom).not.toBeNull();
        console.log(`After second zo: zoom ${afterSecondZoom}`);

        // Verify zoom decreased twice (0.1 each time)
        expect(afterFirstZoom).toBeLessThan(initialZoom);
        expect(afterSecondZoom).toBeLessThan(afterFirstZoom);
        expect(afterSecondZoom).toBeCloseTo(initialZoom - 0.2, 2);
    });

    test('pressing 3zo decreases zoom by 3x', async () => {
        const activeTab = await getActiveTab(bgWs);
        const initialZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Initial zoom: ${initialZoom}`);

        // Send '3' followed by 'zo' to create 3zo command
        await sendKey(pageWs, '3', 50);
        await sendKey(pageWs, 'z', 50);
        await sendKey(pageWs, 'o');

        // Poll for zoom change
        const newZoom = await waitForZoomChange(bgWs, activeTab.id, initialZoom);
        expect(newZoom).not.toBeNull();
        console.log(`After 3zo: zoom ${newZoom}`);

        // Verify zoom decreased by 3x (0.1 * 3 = 0.3)
        expect(newZoom).toBeLessThan(initialZoom);
        expect(newZoom).toBeCloseTo(initialZoom - 0.3, 2);
    });

    test('zoom only affects current tab', async () => {
        const activeTab = await getActiveTab(bgWs);
        console.log(`Active tab: id ${activeTab.id}, index ${activeTab.index}`);

        // Get initial zoom for all tabs
        const initialZooms: { [key: number]: number } = {};
        for (const tabId of tabIds) {
            initialZooms[tabId] = await getTabZoom(bgWs, tabId);
        }
        console.log(`Initial zooms: ${JSON.stringify(initialZooms)}`);

        // Press 'zo' to zoom out on current tab
        await sendKey(pageWs, 'z', 50);
        await sendKey(pageWs, 'o');

        // Poll for zoom change on active tab
        const newActiveZoom = await waitForZoomChange(bgWs, activeTab.id, initialZooms[activeTab.id]);
        expect(newActiveZoom).not.toBeNull();
        console.log(`Active tab ${activeTab.id} zoom changed: ${initialZooms[activeTab.id]} -> ${newActiveZoom}`);

        // Wait for propagation
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify other tabs' zoom levels remained unchanged
        for (const tabId of tabIds) {
            if (tabId !== activeTab.id) {
                const otherTabZoom = await getTabZoom(bgWs, tabId);
                expect(otherTabZoom).toBeCloseTo(initialZooms[tabId], 2);
                console.log(`Other tab ${tabId} zoom unchanged: ${otherTabZoom}`);
            }
        }
    });

    test('zoom level is persistent to specific tab', async () => {
        const activeTab = await getActiveTab(bgWs);
        const initialZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Active tab: id ${activeTab.id}, initial zoom: ${initialZoom}`);

        // Press 'zo' to zoom out
        await sendKey(pageWs, 'z', 50);
        await sendKey(pageWs, 'o');

        // Poll for zoom change
        const zoomedLevel = await waitForZoomChange(bgWs, activeTab.id, initialZoom);
        expect(zoomedLevel).not.toBeNull();
        console.log(`After zo: zoom ${zoomedLevel}`);

        // Switch to a different tab
        const nextTabId = tabIds[3]; // Switch to tab 3
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${nextTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);

        // Wait for tab switch
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify we switched tabs
        const afterSwitchTab = await getActiveTab(bgWs);
        expect(afterSwitchTab.id).toBe(nextTabId);
        console.log(`Switched to tab ${afterSwitchTab.id}`);

        // Switch back to the original tab
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${activeTab.id}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);

        // Wait for tab switch
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify zoom level persisted on original tab
        const persistedZoom = await getTabZoom(bgWs, activeTab.id);
        expect(persistedZoom).toBeCloseTo(zoomedLevel, 2);
        console.log(`Zoom persisted on original tab: ${persistedZoom}`);
    });

    test('zoom respects minimum boundary', async () => {
        const activeTab = await getActiveTab(bgWs);

        // Set zoom to very low level (close to min)
        const nearMinZoom = 0.3; // Chrome min is typically 0.25
        await setTabZoom(bgWs, activeTab.id, nearMinZoom);

        // Wait for zoom to be set
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeMinZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Before min test: zoom ${beforeMinZoom}`);

        // Try to zoom out further
        await sendKey(pageWs, 'z', 50);
        await sendKey(pageWs, 'o');

        // Wait and check zoom
        await new Promise(resolve => setTimeout(resolve, 500));

        const afterMinZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`After min test: zoom ${afterMinZoom}`);

        // Verify zoom didn't go below min (Chrome min is 0.25)
        expect(afterMinZoom).toBeGreaterThanOrEqual(0.25);
        console.log(`Zoom respects min boundary: ${afterMinZoom} >= 0.25`);
    });
});
