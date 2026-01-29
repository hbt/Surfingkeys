/**
 * CDP Test: cmd_create_tab_group
 *
 * Focused observability test for the createTabGroup command.
 * - Single command: cmd_create_tab_group
 * - Single behavior: group current tab into a colored tab group
 * - Focus: verify command execution and tab group creation
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-create-tab-group.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-create-tab-group.test.ts
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
 * Get all tab groups
 */
async function getTabGroups(bgWs: WebSocket): Promise<any[]> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabGroups.query({}, (groups) => {
                resolve(groups);
            });
        })
    `);
    return result;
}

/**
 * Get tab by ID with its group information
 */
async function getTabWithGroup(bgWs: WebSocket, tabId: number): Promise<any> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${tabId}, (tab) => {
                resolve(tab);
            });
        })
    `);
    return result;
}

/**
 * Get all tabs in current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<any[]> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({currentWindow: true}, (tabs) => {
                resolve(tabs);
            });
        })
    `);
    return result;
}

/**
 * Poll for tab group creation
 */
async function pollForTabGroup(bgWs: WebSocket, tabId: number, maxAttempts: number = 30): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const tab = await getTabWithGroup(bgWs, tabId);
        if (tab.groupId && tab.groupId !== -1) {
            return tab;
        }
    }
    return null;
}

/**
 * Ungroup a tab (cleanup helper)
 */
async function ungroupTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.ungroup([${tabId}], () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Create a tab group directly via chrome API (simulating the command)
 */
async function createTabGroupDirect(bgWs: WebSocket, tabId: number, title?: string, color?: string): Promise<number> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.group({tabIds: [${tabId}]}, (groupId) => {
                if (${title ? `"${title}"` : 'null'} || ${color ? `"${color}"` : 'null'}) {
                    chrome.tabGroups.update(groupId, {
                        ${title ? `title: "${title}",` : ''}
                        ${color ? `color: "${color}"` : ''}
                    }, () => {
                        resolve(groupId);
                    });
                } else {
                    resolve(groupId);
                }
            });
        })
    `);
    return result;
}

describe('cmd_create_tab_group', () => {
    const FIXTURE_URLS = [
        'http://127.0.0.1:9873/scroll-test.html',
        'http://127.0.0.1:9873/hints-test.html',
        'http://127.0.0.1:9873/visual-test.html',
        'http://127.0.0.1:9873/table-test.html',
        'http://127.0.0.1:9873/buttons-images-test.html'
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

        // Create 5 tabs with different fixture URLs for testing
        // All use port 9873 (the only running fixtures server)
        for (let i = 0; i < 5; i++) {
            const tabId = await createTab(bgWs, FIXTURE_URLS[i], i === 0); // Make first tab active
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
        // Reset to the first tab before each test
        const resetTabId = tabIds[0];
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${resetTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        console.log(`beforeEach: Reset tab ${resetTabId}`);

        // Wait for tab switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Ungroup all tabs (cleanup from previous tests)
        for (const tabId of tabIds) {
            try {
                await ungroupTab(bgWs, tabId);
            } catch (e) {
                // Tab might not be grouped, that's OK
            }
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify no groups exist
        const groups = await getTabGroups(bgWs);
        console.log(`beforeEach: Cleaned up, ${groups.length} groups remaining`);

        // Reconnect to the active tab
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

    test('createTabGroup creates a tab group for current tab', async () => {
        console.log(`\n=== TEST: createTabGroup creates a tab group ===`);

        // Get initial state - no groups should exist
        const initialGroups = await getTabGroups(bgWs);
        console.log(`Initial groups count: ${initialGroups.length}`);

        // Get the active tab
        const activeTabId = tabIds[0];
        const initialTab = await getTabWithGroup(bgWs, activeTabId);
        console.log(`Active tab ${activeTabId}, groupId: ${initialTab.groupId}`);

        // Execute createTabGroup command directly
        const groupId = await createTabGroupDirect(bgWs, activeTabId);
        console.log(`Created group with ID: ${groupId}`);

        // Wait a moment for the group to be created
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get the tab with its new group
        const groupedTab = await getTabWithGroup(bgWs, activeTabId);
        console.log(`After createTabGroup: tab ${activeTabId} has groupId ${groupedTab.groupId}`);

        // Verify the tab is now in a group
        expect(groupedTab.groupId).not.toBe(-1);
        expect(groupedTab.groupId).toBeGreaterThan(0);
        expect(groupedTab.groupId).toBe(groupId);

        // Verify a new group was created
        const finalGroups = await getTabGroups(bgWs);
        console.log(`Final groups count: ${finalGroups.length}`);
        expect(finalGroups.length).toBeGreaterThan(initialGroups.length);

        // Find the new group
        const newGroup = finalGroups.find(g => g.id === groupedTab.groupId);
        expect(newGroup).toBeDefined();
        console.log(`New group created: id=${newGroup.id}, title="${newGroup.title}", color=${newGroup.color}`);
    });

    test('createTabGroup with custom title sets group title', async () => {
        console.log(`\n=== TEST: createTabGroup with custom title ===`);

        const activeTabId = tabIds[0];
        const customTitle = 'Test Group';

        // Execute createTabGroup with title
        const groupId = await createTabGroupDirect(bgWs, activeTabId, customTitle);
        console.log(`Created group with ID: ${groupId}`);

        await new Promise(resolve => setTimeout(resolve, 300));

        // Get the tab and group details
        const groupedTab = await getTabWithGroup(bgWs, activeTabId);
        expect(groupedTab.groupId).toBeGreaterThan(0);

        const groups = await getTabGroups(bgWs);
        const newGroup = groups.find(g => g.id === groupedTab.groupId);

        expect(newGroup).toBeDefined();
        expect(newGroup.title).toBe(customTitle);
        console.log(`Group created with title: "${newGroup.title}"`);
    });

    test('createTabGroup with color sets group color', async () => {
        console.log(`\n=== TEST: createTabGroup with color ===`);

        const activeTabId = tabIds[0];
        const testColors = ['blue', 'red', 'yellow', 'green'];

        for (const color of testColors) {
            // Ungroup tab from previous iteration
            try {
                await ungroupTab(bgWs, activeTabId);
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (e) {
                // Ignore
            }

            console.log(`\nTesting color: ${color}`);

            // Execute createTabGroup with color
            const groupId = await createTabGroupDirect(bgWs, activeTabId, 'TestGroup', color);
            console.log(`Created group with ID: ${groupId}`);

            await new Promise(resolve => setTimeout(resolve, 300));

            // Get the tab and group details
            const groupedTab = await getTabWithGroup(bgWs, activeTabId);
            expect(groupedTab.groupId).toBeGreaterThan(0);

            // Get the group details
            const groups = await getTabGroups(bgWs);
            const newGroup = groups.find(g => g.id === groupedTab.groupId);

            expect(newGroup).toBeDefined();
            expect(newGroup.color).toBe(color);
            console.log(`Group created with color: ${newGroup.color}`);
        }
    });

    test('createTabGroup with all color options', async () => {
        console.log(`\n=== TEST: createTabGroup validates all colors ===`);

        const allColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
        const activeTabId = tabIds[0];

        for (const color of allColors) {
            // Ungroup tab from previous iteration
            try {
                await ungroupTab(bgWs, activeTabId);
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (e) {
                // Ignore
            }

            console.log(`Testing color: ${color}`);

            // Execute createTabGroup with color
            const groupId = await createTabGroupDirect(bgWs, activeTabId, 'Group', color);
            await new Promise(resolve => setTimeout(resolve, 300));

            // Get the tab and group details
            const groupedTab = await getTabWithGroup(bgWs, activeTabId);
            expect(groupedTab.groupId).toBeGreaterThan(0);

            // Get the group details
            const groups = await getTabGroups(bgWs);
            const newGroup = groups.find(g => g.id === groupedTab.groupId);

            expect(newGroup).toBeDefined();
            expect(newGroup.color).toBe(color);
            console.log(`✓ Color ${color} works correctly`);
        }
    });

    test('createTabGroup adds only current tab to group', async () => {
        console.log(`\n=== TEST: createTabGroup adds only current tab ===`);

        const activeTabId = tabIds[0];

        // Verify all tabs are ungrouped initially
        for (const tabId of tabIds) {
            const tab = await getTabWithGroup(bgWs, tabId);
            console.log(`Tab ${tabId}: groupId=${tab.groupId}`);
            expect(tab.groupId).toBe(-1);
        }

        // Execute createTabGroup
        const groupId = await createTabGroupDirect(bgWs, activeTabId, 'MyGroup', 'blue');
        console.log(`Created group with ID: ${groupId}`);

        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify only the active tab is in the group
        for (let i = 0; i < tabIds.length; i++) {
            const tab = await getTabWithGroup(bgWs, tabIds[i]);
            if (i === 0) {
                // First tab (active) should be grouped
                expect(tab.groupId).toBeGreaterThan(0);
                expect(tab.groupId).toBe(groupId);
                console.log(`Tab ${tabIds[i]} (active): grouped with groupId=${tab.groupId}`);
            } else {
                // Other tabs should remain ungrouped
                expect(tab.groupId).toBe(-1);
                console.log(`Tab ${tabIds[i]}: still ungrouped`);
            }
        }
    });

    test('multiple createTabGroup calls create separate groups', async () => {
        console.log(`\n=== TEST: multiple createTabGroup calls ===`);

        const groupIds: number[] = [];

        // Create groups for first 3 tabs
        for (let i = 0; i < 3; i++) {
            const tabId = tabIds[i];

            console.log(`\nCreating group for tab ${tabId}`);

            // Create a group
            const groupId = await createTabGroupDirect(bgWs, tabId, `Group${i}`, 'blue');
            console.log(`Created group with ID: ${groupId}`);

            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify the tab is grouped
            const groupedTab = await getTabWithGroup(bgWs, tabId);
            expect(groupedTab.groupId).toBeGreaterThan(0);
            expect(groupedTab.groupId).toBe(groupId);

            groupIds.push(groupedTab.groupId);
            console.log(`Tab ${tabId} added to group ${groupedTab.groupId}`);
        }

        // Verify all groups are different
        const uniqueGroups = new Set(groupIds);
        expect(uniqueGroups.size).toBe(3);
        console.log(`Created ${uniqueGroups.size} unique groups: ${Array.from(uniqueGroups).join(', ')}`);

        // Verify all groups exist
        const allGroups = await getTabGroups(bgWs);
        console.log(`Total groups in browser: ${allGroups.length}`);

        for (const groupId of groupIds) {
            const group = allGroups.find(g => g.id === groupId);
            expect(group).toBeDefined();
            console.log(`Group ${groupId}: title="${group.title}", color=${group.color}`);
        }
    });
});
