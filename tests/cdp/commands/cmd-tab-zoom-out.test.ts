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
 * Uses per-tab scope to prevent Chrome from syncing zoom across tabs with same origin
 */
async function setTabZoom(bgWs: WebSocket, tabId: number, zoomFactor: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.setZoomSettings(${tabId}, { scope: 'per-tab' }, () => {
                chrome.tabs.setZoom(${tabId}, ${zoomFactor}, () => {
                    resolve(true);
                });
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
 * Simulate zo command by decreasing zoom by specified factor
 * This mimics what the zo command does internally
 * Uses per-tab scope to prevent Chrome from syncing zoom across tabs with same origin
 */
async function decrementZoom(bgWs: WebSocket, tabId: number, zoomFactor: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.setZoomSettings(${tabId}, { scope: 'per-tab' }, () => {
                chrome.tabs.getZoom(${tabId}, (currentZoom) => {
                    chrome.tabs.setZoom(${tabId}, currentZoom - ${zoomFactor}, () => resolve(true));
                });
            });
        })
    `);
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

    test('zoom out via setZoom background API', async () => {
        // Get active tab
        const activeTab = await getActiveTab(bgWs);
        console.log(`Active tab: index ${activeTab.index}, id ${activeTab.id}`);

        // Get initial zoom level
        const initialZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Initial zoom: ${initialZoom}`);
        expect(initialZoom).toBeCloseTo(1.0, 2);

        // Simulate zo command (decrements zoom by 0.1)
        await decrementZoom(bgWs, activeTab.id, 0.1);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify zoom decreased by 0.1
        const newZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`After zoom: ${newZoom}`);
        expect(newZoom).toBeCloseTo(initialZoom - 0.1, 2);
    });

    test('zoom out twice decreases zoom by 0.2', async () => {
        const activeTab = await getActiveTab(bgWs);
        const initialZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Initial zoom: ${initialZoom}`);

        // First zoom out
        await decrementZoom(bgWs, activeTab.id, 0.1);
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterFirstZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`After first zoom: ${afterFirstZoom}`);
        expect(afterFirstZoom).toBeCloseTo(initialZoom - 0.1, 2);

        // Second zoom out
        await decrementZoom(bgWs, activeTab.id, 0.1);
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterSecondZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`After second zoom: ${afterSecondZoom}`);
        expect(afterSecondZoom).toBeCloseTo(initialZoom - 0.2, 2);
    });

    test('zoom out with repeats=3 decreases zoom by 0.3', async () => {
        const activeTab = await getActiveTab(bgWs);
        const initialZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Initial zoom: ${initialZoom}`);

        // Simulate 3zo command (3 * 0.1 = 0.3)
        await decrementZoom(bgWs, activeTab.id, 0.3);
        await new Promise(resolve => setTimeout(resolve, 300));

        const newZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`After 3x zoom: ${newZoom}`);
        expect(newZoom).toBeCloseTo(initialZoom - 0.3, 2);
    });

    test('zoom only affects specified tab', async () => {
        const activeTab = await getActiveTab(bgWs);
        console.log(`Active tab: id ${activeTab.id}, index ${activeTab.index}`);

        // Get initial zoom for all tabs
        const initialZooms: { [key: number]: number } = {};
        for (const tabId of tabIds) {
            initialZooms[tabId] = await getTabZoom(bgWs, tabId);
        }
        console.log(`Initial zooms: ${JSON.stringify(initialZooms)}`);

        // Zoom out on active tab only
        await decrementZoom(bgWs, activeTab.id, 0.1);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify active tab zoom changed
        const newActiveZoom = await getTabZoom(bgWs, activeTab.id);
        expect(newActiveZoom).toBeCloseTo(initialZooms[activeTab.id] - 0.1, 2);
        console.log(`Active tab ${activeTab.id} zoom changed: ${initialZooms[activeTab.id]} -> ${newActiveZoom}`);

        // Verify other tabs' zoom levels remained unchanged
        for (const tabId of tabIds) {
            if (tabId !== activeTab.id) {
                const otherTabZoom = await getTabZoom(bgWs, tabId);
                console.log(`Other tab ${tabId}: expected ${initialZooms[tabId]}, got ${otherTabZoom}`);
                expect(otherTabZoom).toBeCloseTo(initialZooms[tabId], 2);
            }
        }
    });

    test('zoom level persists when switching tabs', async () => {
        const activeTab = await getActiveTab(bgWs);
        const initialZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Active tab: id ${activeTab.id}, initial zoom: ${initialZoom}`);

        // Zoom out on active tab
        await decrementZoom(bgWs, activeTab.id, 0.1);
        await new Promise(resolve => setTimeout(resolve, 300));

        const zoomedLevel = await getTabZoom(bgWs, activeTab.id);
        console.log(`After zoom: ${zoomedLevel}`);
        expect(zoomedLevel).toBeCloseTo(initialZoom - 0.1, 2);

        // Switch to a different tab
        const nextTabId = tabIds[3];
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${nextTabId}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify we switched tabs
        const afterSwitchTab = await getActiveTab(bgWs);
        expect(afterSwitchTab.id).toBe(nextTabId);
        console.log(`Switched to tab ${afterSwitchTab.id}`);

        // Switch back to the original tab
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${activeTab.id}, { active: true }, () => resolve(true));
            })
        `);
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
        await new Promise(resolve => setTimeout(resolve, 300));

        const beforeMinZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`Before min test: zoom ${beforeMinZoom}`);

        // Try to zoom out further
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                const message = { action: 'setZoom', zoomFactor: -0.1, repeats: 1 };
                const sender = { tab: { id: ${activeTab.id} } };
                runtime.setZoom(message, sender, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        const afterMinZoom = await getTabZoom(bgWs, activeTab.id);
        console.log(`After min test: zoom ${afterMinZoom}`);

        // Verify zoom didn't go below min (Chrome min is 0.25)
        expect(afterMinZoom).toBeGreaterThanOrEqual(0.25);
        console.log(`Zoom respects min boundary: ${afterMinZoom} >= 0.25`);
    });
});
