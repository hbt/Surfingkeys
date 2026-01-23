/**
 * CDP Chrome Tabs API Test - Tabs Verification
 *
 * Tests Chrome tabs API through CDP using Jest framework.
 * Verifies tab querying, filtering, creation, activation, and cleanup.
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/infrastructure/cdp-chrome-tabs-api.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/infrastructure/cdp-chrome-tabs-api.test.ts
 */

import WebSocket from 'ws';
import {
    checkCDPAvailable,
    findExtensionBackground,
    connectToCDP,
    executeInTarget,
    closeTab,
    closeCDP
} from '../utils/cdp-client';
import { setupPerTestCoverageHooks } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

interface TabInfo {
    id: number;
    title: string;
    url: string;
    active: boolean;
    windowId: number;
}

describe('Chrome Tabs API', () => {
    let bgWs: WebSocket;
    let extensionId: string;
    let createdTabId: number | null = null;

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

        // Wait for background to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    const coverageHooks = setupPerTestCoverageHooks(bgWs);
    beforeEach(coverageHooks.beforeEach);
    afterEach(coverageHooks.afterEach);

    afterAll(async () => {
        // Cleanup created tab if it exists
        if (createdTabId && bgWs) {
            try {
                await closeTab(bgWs, createdTabId);
            } catch (error) {
                // Tab might already be closed, ignore error
            }
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    describe('Tab Querying', () => {
        test('should query all tabs', async () => {
            const allTabs = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.query({}, (tabs) => {
                        resolve(tabs.map(t => ({
                            id: t.id,
                            title: t.title,
                            url: t.url,
                            active: t.active,
                            windowId: t.windowId
                        })));
                    });
                })
            `);

            expect(allTabs).toBeDefined();
            expect(Array.isArray(allTabs)).toBe(true);
            expect(allTabs.length).toBeGreaterThan(0);

            // Verify tab structure
            const tab = allTabs[0];
            expect(tab).toHaveProperty('id');
            expect(tab).toHaveProperty('title');
            expect(tab).toHaveProperty('url');
            expect(tab).toHaveProperty('active');
            expect(tab).toHaveProperty('windowId');
        });

        test('should find active tab', async () => {
            const activeTab = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                        resolve(tabs[0] ? {
                            id: tabs[0].id,
                            title: tabs[0].title,
                            url: tabs[0].url,
                            active: tabs[0].active
                        } : null);
                    });
                })
            `);

            expect(activeTab).toBeDefined();
            expect(activeTab).not.toBeNull();
            expect(activeTab.id).toBeGreaterThan(0);
            expect(activeTab.active).toBe(true);
        });

        test('should query tabs in current window', async () => {
            const currentWindowTabs = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.query({currentWindow: true}, (tabs) => {
                        resolve(tabs.length);
                    });
                })
            `);

            expect(currentWindowTabs).toBeGreaterThan(0);
        });
    });

    describe('Tab Filtering', () => {
        test('should filter valid tabs (extension can run)', async () => {
            const allTabs = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.query({}, (tabs) => {
                        resolve(tabs.map(t => ({
                            id: t.id,
                            title: t.title,
                            url: t.url
                        })));
                    });
                })
            `);

            const validTabs = allTabs.filter((tab: TabInfo) => {
                const url = tab.url || '';
                const isRestricted = url.startsWith('chrome://') ||
                                   url.startsWith('chrome-extension://') ||
                                   url.startsWith('edge://') ||
                                   url.startsWith('about:');
                return !isRestricted;
            });

            expect(validTabs.length).toBeGreaterThanOrEqual(0);
            expect(validTabs.length).toBeLessThanOrEqual(allTabs.length);

            // Verify no restricted URLs in valid tabs
            validTabs.forEach((tab: TabInfo) => {
                const url = tab.url || '';
                expect(url).not.toMatch(/^chrome:\/\//);
                expect(url).not.toMatch(/^chrome-extension:\/\//);
                expect(url).not.toMatch(/^edge:\/\//);
                expect(url).not.toMatch(/^about:/);
            });
        });
    });

    describe('Tab Management', () => {
        test('should create new tab with fixture', async () => {
            const fixtureUrl = `chrome-extension://${extensionId}/pages/fixtures/hackernews.html`;

            const newTab = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.create({
                        url: '${fixtureUrl}',
                        active: false
                    }, (tab) => {
                        resolve({
                            id: tab.id,
                            url: tab.url,
                            title: tab.title
                        });
                    });
                })
            `);

            expect(newTab).toBeDefined();
            expect(newTab.id).toBeGreaterThan(0);
            // Note: tab.url might be empty string in callback due to Chrome security restrictions
            // for extension URLs. The old test just logged it without asserting.

            // Store for cleanup
            createdTabId = newTab.id;
        });

        test('should activate tab', async () => {
            // Ensure we have a tab to activate
            if (!createdTabId) {
                const fixtureUrl = `chrome-extension://${extensionId}/pages/fixtures/hackernews.html`;
                const newTab = await executeInTarget(bgWs, `
                    new Promise((resolve) => {
                        chrome.tabs.create({
                            url: '${fixtureUrl}',
                            active: false
                        }, (tab) => {
                            resolve({
                                id: tab.id
                            });
                        });
                    })
                `);
                createdTabId = newTab.id;
            }

            // Activate the tab
            await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.update(${createdTabId}, {active: true}, (tab) => {
                        resolve(tab.id);
                    });
                })
            `);

            // Wait for activation to complete
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify activation
            const isActive = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.get(${createdTabId}, (tab) => {
                        resolve(tab.active);
                    });
                })
            `);

            expect(isActive).toBe(true);
        });

        test('should close created tab', async () => {
            // Ensure we have a tab to close
            if (!createdTabId) {
                const fixtureUrl = `chrome-extension://${extensionId}/pages/fixtures/hackernews.html`;
                const newTab = await executeInTarget(bgWs, `
                    new Promise((resolve) => {
                        chrome.tabs.create({
                            url: '${fixtureUrl}',
                            active: false
                        }, (tab) => {
                            resolve({
                                id: tab.id
                            });
                        });
                    })
                `);
                createdTabId = newTab.id;
            }

            const tabIdToClose = createdTabId;

            // Close the tab
            const result = await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.remove(${tabIdToClose}, () => {
                        resolve(true);
                    });
                })
            `);

            // Just verify the close operation completed
            // Note: The old test didn't verify the tab was actually gone,
            // just that the close command succeeded
            expect(result).toBe(true);

            // Clear the stored ID
            createdTabId = null;
        });
    });
});
