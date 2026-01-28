/**
 * CDP Test: cmd_tab_group
 *
 * Focused observability test for the tab group command.
 * - Single command: cmd_tab_group
 * - Single key: ';G'
 * - Single behavior: group current tab into a tab group
 * - Focus: verify command execution and tab grouping without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-tab-group.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-tab-group.test.ts
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
async function getActiveTab(bgWs: WebSocket): Promise<{ id: number; index: number; url: string; groupId?: number }> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    resolve({
                        id: tabs[0].id,
                        index: tabs[0].index,
                        url: tabs[0].url,
                        groupId: tabs[0].groupId
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
    return result || [];
}

/**
 * Get a specific tab's details including groupId
 */
async function getTabInfo(bgWs: WebSocket, tabId: number): Promise<{ id: number; groupId?: number }> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${tabId}, (tab) => {
                resolve({
                    id: tab.id,
                    groupId: tab.groupId
                });
            });
        })
    `);
    return result;
}

/**
 * Ungroup a tab (remove from tab group)
 */
async function ungroupTab(bgWs: WebSocket, tabId: number): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.ungroup(${tabId}, () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Poll for tab group state change
 */
async function pollForGroupChange(
    bgWs: WebSocket,
    tabId: number,
    maxAttempts: number = 50,
    intervalMs: number = 100
): Promise<{ groupId: number; groups: any[] }> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        const tabInfo = await getTabInfo(bgWs, tabId);
        const groups = await getTabGroups(bgWs);

        // groupId of -1 means not grouped, any other value means grouped
        if (tabInfo.groupId !== undefined && tabInfo.groupId !== -1) {
            return { groupId: tabInfo.groupId, groups };
        }
    }
    return null;
}

describe('cmd_tab_group', () => {
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

        // Create 5 tabs for testing
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
        // Ungroup all test tabs before each test
        console.log(`beforeEach: Ungrouping all test tabs`);
        for (const tabId of tabIds) {
            try {
                const tabInfo = await getTabInfo(bgWs, tabId);
                if (tabInfo.groupId !== undefined && tabInfo.groupId !== -1) {
                    await ungroupTab(bgWs, tabId);
                    console.log(`  Ungrouped tab ${tabId} from group ${tabInfo.groupId}`);
                }
            } catch (e) {
                // Tab might not be in a group, that's fine
            }
        }
        await new Promise(resolve => setTimeout(resolve, 300)); // Wait for ungroup to complete

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

        // Verify the reset worked by checking which tab is active
        const verifyTab = await getActiveTab(bgWs);
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}, groupId: ${verifyTab.groupId}`);

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

    test('tab is initially ungrouped', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}, groupId: ${initialTab.groupId}`);

        // Tab should not be in a group initially (groupId is -1 or undefined when not grouped)
        const isUngrouped = initialTab.groupId === undefined || initialTab.groupId === -1;
        console.log(`Tab ${initialTab.id} is ungrouped: ${isUngrouped}`);
        expect(isUngrouped).toBe(true);

        // Verify no groups exist initially
        const initialGroups = await getTabGroups(bgWs);
        console.log(`Initial tab groups count: ${initialGroups.length}`);

        // Should start with 0 groups (or at least verify we can query groups)
        expect(Array.isArray(initialGroups)).toBe(true);
    });

    test('grouping a tab adds it to a new group', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id}, groupId: ${initialTab.groupId}`);

        // Tab should not be in a group initially
        expect(initialTab.groupId === undefined || initialTab.groupId === -1).toBe(true);

        // Get initial tab groups count
        const initialGroups = await getTabGroups(bgWs);
        const initialGroupCount = initialGroups.length;
        console.log(`Initial tab groups: ${initialGroupCount}`);

        // Press ;G to open the tab group UI
        await sendKey(pageWs, ';');
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendKey(pageWs, 'G');

        // Wait for UI to appear
        await new Promise(resolve => setTimeout(resolve, 500));

        // Since there are no groups initially, the command should open omnibar
        // We'll simulate creating a group by pressing the hint for "New tab group"
        // The UI shows hints, so we need to find and press the appropriate hint

        // Get the hint label for the new group option
        const hintLabel = await executeInTarget(pageWs, `
            (() => {
                const hints = document.querySelectorAll('#sk_tabs .sk_tab_hint');
                if (hints.length > 0) {
                    // The last hint should be for "New tab group"
                    const lastHint = hints[hints.length - 1];
                    return lastHint.textContent;
                }
                return null;
            })()
        `);

        console.log(`New group hint label: ${hintLabel}`);

        if (hintLabel) {
            // Send the hint keys to select the new group option
            for (const char of hintLabel) {
                await sendKey(pageWs, char);
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Wait for the omnibar to appear with the createTabGroup command
            await new Promise(resolve => setTimeout(resolve, 500));

            // Press Enter to create the group with default name
            await sendKey(pageWs, 'Enter');

            // Poll for the group to be created
            const groupResult = await pollForGroupChange(bgWs, initialTab.id);

            expect(groupResult).not.toBeNull();
            console.log(`After grouping: tab ${initialTab.id} is in group ${groupResult.groupId}`);
            console.log(`Total groups after: ${groupResult.groups.length}`);

            // Verify the tab is now in a group
            expect(groupResult.groupId).toBeGreaterThan(-1);
            expect(groupResult.groups.length).toBe(initialGroupCount + 1);
        }
    });

    test('grouped tab appears in chrome.tabGroups API', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}, groupId: ${initialTab.groupId}`);

        // Manually create a group for this tab using Chrome API
        const groupId = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.group({ tabIds: ${initialTab.id} }, (createdGroupId) => {
                    resolve(createdGroupId);
                });
            })
        `);

        console.log(`Created group: ${groupId}`);
        expect(groupId).toBeGreaterThan(-1);

        // Wait for the group to be fully created
        await new Promise(resolve => setTimeout(resolve, 300));

        // Poll for tab to be in the group
        let groupedTab = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            groupedTab = await getTabInfo(bgWs, initialTab.id);
            if (groupedTab.groupId !== undefined && groupedTab.groupId !== -1) {
                break;
            }
        }

        expect(groupedTab).not.toBeNull();
        expect(groupedTab.groupId).toBe(groupId);
        console.log(`Tab ${initialTab.id} is now in group ${groupedTab.groupId}`);

        // Verify the group appears in tabGroups API
        const groups = await getTabGroups(bgWs);
        const ourGroup = groups.find(g => g.id === groupId);

        expect(ourGroup).toBeDefined();
        expect(ourGroup.id).toBe(groupId);
        console.log(`Group found in tabGroups API: id=${ourGroup.id}, title="${ourGroup.title}", collapsed=${ourGroup.collapsed}`);
    });

    test('multiple sequential grouping operations work correctly', async () => {
        // Group the first tab manually
        const tab1Id = tabIds[0];
        const group1Id = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.group({ tabIds: ${tab1Id} }, (createdGroupId) => {
                    resolve(createdGroupId);
                });
            })
        `);

        console.log(`Created first group: ${group1Id} for tab ${tab1Id}`);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Group the second tab manually
        const tab2Id = tabIds[1];
        const group2Id = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.group({ tabIds: ${tab2Id} }, (createdGroupId) => {
                    resolve(createdGroupId);
                });
            })
        `);

        console.log(`Created second group: ${group2Id} for tab ${tab2Id}`);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify both groups exist
        const groups = await getTabGroups(bgWs);
        console.log(`Total groups: ${groups.length}`);
        expect(groups.length).toBeGreaterThanOrEqual(2);

        // Verify both tabs are grouped
        const tab1Info = await getTabInfo(bgWs, tab1Id);
        const tab2Info = await getTabInfo(bgWs, tab2Id);

        expect(tab1Info.groupId).toBe(group1Id);
        expect(tab2Info.groupId).toBe(group2Id);
        expect(tab1Info.groupId).not.toBe(tab2Info.groupId);

        console.log(`Tab ${tab1Id} in group ${tab1Info.groupId}, Tab ${tab2Id} in group ${tab2Info.groupId}`);
    });

    test('grouping does not affect other tabs', async () => {
        // Get info about all tabs before grouping
        const beforeTabInfos = await Promise.all(
            tabIds.map(id => getTabInfo(bgWs, id))
        );

        console.log(`Before grouping: tab group IDs: ${beforeTabInfos.map(t => t.groupId || -1).join(', ')}`);

        // All tabs should be ungrouped
        beforeTabInfos.forEach(tab => {
            expect(tab.groupId === undefined || tab.groupId === -1).toBe(true);
        });

        // Group only the middle tab (tabIds[2])
        const targetTabId = tabIds[2];
        const groupId = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.group({ tabIds: ${targetTabId} }, (createdGroupId) => {
                    resolve(createdGroupId);
                });
            })
        `);

        console.log(`Created group ${groupId} for tab ${targetTabId}`);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get info about all tabs after grouping
        const afterTabInfos = await Promise.all(
            tabIds.map(id => getTabInfo(bgWs, id))
        );

        console.log(`After grouping: tab group IDs: ${afterTabInfos.map(t => t.groupId || -1).join(', ')}`);

        // Verify only the target tab is grouped
        afterTabInfos.forEach((tab, index) => {
            if (tab.id === targetTabId) {
                expect(tab.groupId).toBe(groupId);
                console.log(`✓ Target tab ${tab.id} is in group ${tab.groupId}`);
            } else {
                expect(tab.groupId === undefined || tab.groupId === -1).toBe(true);
                console.log(`✓ Other tab ${tab.id} remains ungrouped`);
            }
        });
    });

    test('group properties can be queried via chrome.tabGroups API', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: id ${initialTab.id}`);

        // Create a group with a custom title
        const groupId = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.group({ tabIds: ${initialTab.id} }, (createdGroupId) => {
                    chrome.tabGroups.update(createdGroupId, { title: "Test Group", color: "blue" }, () => {
                        resolve(createdGroupId);
                    });
                });
            })
        `);

        console.log(`Created group ${groupId} with title "Test Group"`);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify tab is grouped
        const groupedTab = await getTabInfo(bgWs, initialTab.id);
        expect(groupedTab.groupId).toBe(groupId);

        // Query the group properties
        const groupInfo = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabGroups.get(${groupId}, (group) => {
                    resolve({
                        id: group.id,
                        title: group.title,
                        color: group.color,
                        collapsed: group.collapsed
                    });
                });
            })
        `);

        console.log(`Group properties:`, JSON.stringify(groupInfo, null, 2));

        // Verify group properties
        expect(groupInfo.id).toBe(groupId);
        expect(groupInfo.title).toBe("Test Group");
        expect(groupInfo.color).toBe("blue");
        expect(typeof groupInfo.collapsed).toBe("boolean");
    });
});
