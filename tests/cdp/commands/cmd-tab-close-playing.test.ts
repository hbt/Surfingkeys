/**
 * CDP Test: cmd_tab_close_playing
 *
 * Focused observability test for the tab close playing command.
 * - Single command: cmd_tab_close_playing
 * - Single key: 'gxp'
 * - Single behavior: close the tab that is currently playing audio
 * - Focus: verify command execution and tab closure of audible tab
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-tab-close-playing.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-tab-close-playing.test.ts
 *
 * Note on Audio Testing:
 *   Headless Chrome does not mark tabs as "audible" without actual audio hardware.
 *   Tests that require audible tabs will skip automatically in headless mode.
 *   The "no tab is audible" test always passes and verifies the command handles
 *   the no-audible-tabs case correctly.
 *
 *   For full audio functionality testing, run in live browser with audio output:
 *     npm run test:cdp:live tests/cdp/commands/cmd-tab-close-playing.test.ts
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
 * Get all audible tabs in the current window
 */
async function getAudibleTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string; audible: boolean }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ audible: true, currentWindow: true }, (tabs) => {
                resolve(tabs.map(tab => ({
                    id: tab.id,
                    index: tab.index,
                    url: tab.url,
                    audible: tab.audible
                })));
            });
        })
    `);
    return result;
}

/**
 * Get all tabs in the current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(tab => ({
                    id: tab.id,
                    index: tab.index,
                    url: tab.url
                })));
            });
        })
    `);
    return result;
}

/**
 * Check if a tab exists by ID
 */
async function tabExists(bgWs: WebSocket, tabId: number): Promise<boolean> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.get(${tabId}, (tab) => {
                if (chrome.runtime.lastError) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        })
    `);
    return result;
}

/**
 * Start audio playback in a specific tab using CDP
 */
async function startAudioInTab(pageWs: WebSocket): Promise<boolean> {
    const result = await executeInTarget(pageWs, `
        new Promise((resolve) => {
            if (window.audioTest && typeof window.audioTest.play === 'function') {
                window.audioTest.play()
                    .then(() => resolve(true))
                    .catch(err => {
                        console.error('Failed to start audio:', err);
                        resolve(false);
                    });
            } else {
                console.error('audioTest not found on window');
                resolve(false);
            }
        })
    `);
    return result;
}

describe('cmd_tab_close_playing', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';
    const AUDIO_FIXTURE_URL = 'http://127.0.0.1:9873/audio-test.html';

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
        // Tab 0: audio-test.html (will be made audible)
        // Tab 1: scroll-test.html
        // Tab 2: scroll-test.html (middle tab, will be active initially)
        // Tab 3: scroll-test.html
        // Tab 4: audio-test.html (backup audio tab for multi-audible tests)
        const urls = [
            AUDIO_FIXTURE_URL,  // Tab 0: Audio fixture
            FIXTURE_URL,        // Tab 1: Regular
            FIXTURE_URL,        // Tab 2: Regular (active)
            FIXTURE_URL,        // Tab 3: Regular
            AUDIO_FIXTURE_URL   // Tab 4: Audio fixture
        ];

        for (let i = 0; i < urls.length; i++) {
            const tabId = await createTab(bgWs, urls[i], i === 2); // Make tab 2 active (middle tab)
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
        // Reset to the fixture tab before each test (tab 2 - middle, non-audio tab)
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
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}`);

        // Stop any audio that might be playing from previous tests
        // Connect to each audio tab and stop audio
        for (const tabIndex of [0, 4]) {
            const audioTabId = tabIds[tabIndex];
            try {
                // Check if tab still exists before trying to access it
                const exists = await tabExists(bgWs, audioTabId);
                if (!exists) {
                    console.log(`beforeEach: Tab ${audioTabId} no longer exists, skipping audio stop`);
                    continue;
                }

                await executeInTarget(bgWs, `
                    new Promise((resolve) => {
                        chrome.tabs.update(${audioTabId}, { active: true }, () => resolve(true));
                    })
                `);
                await new Promise(resolve => setTimeout(resolve, 300));

                const audioPageWsUrl = await findContentPage('127.0.0.1:9873/audio-test.html');
                const audioPageWs = await connectToCDP(audioPageWsUrl);
                enableInputDomain(audioPageWs);

                await executeInTarget(audioPageWs, `
                    new Promise((resolve) => {
                        if (window.audioTest) {
                            window.audioTest.stop();
                        }
                        resolve(true);
                    })
                `);

                await closeCDP(audioPageWs);
            } catch (e) {
                console.log(`beforeEach: Could not stop audio in tab ${tabIndex}, continuing...`);
            }
        }

        // Switch back to the test tab
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${resetTabId}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

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
                const exists = await tabExists(bgWs, tabId);
                if (exists) {
                    await closeTab(bgWs, tabId);
                }
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

    test('pressing gxp closes the audible tab', async () => {
        // NOTE: This test demonstrates the gxp command behavior but may not fully pass in headless
        // Chrome due to audible flag not being set without actual audio hardware.
        // The test verifies the command execution and documents expected behavior.

        // Get initial active tab (should be tab 2 - non-audio tab)
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: index ${initialTab.index}, id ${initialTab.id} (should be tabIds[2]=${tabIds[2]})`);
        expect(initialTab.id).toBe(tabIds[2]);

        // Get initial tab count
        const initialTabs = await getAllTabs(bgWs);
        console.log(`Initial tab count: ${initialTabs.length}`);

        // Verify no tabs are currently audible
        const audibleBefore = await getAudibleTabs(bgWs);
        console.log(`Audible tabs before: ${audibleBefore.length}`);

        // Switch to tab 0 (audio tab) and start audio
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[0]}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to audio tab and start playback
        const audioPageWsUrl = await findContentPage('127.0.0.1:9873/audio-test.html');
        const audioPageWs = await connectToCDP(audioPageWsUrl);
        enableInputDomain(audioPageWs);

        const audioStarted = await startAudioInTab(audioPageWs);
        console.log(`Audio started successfully: ${audioStarted}`);

        await closeCDP(audioPageWs);

        // Wait for Chrome to potentially mark tab as audible (may not happen in headless)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if tab is now audible
        const audibleAfterStart = await getAudibleTabs(bgWs);
        console.log(`Audible tabs after starting audio: ${audibleAfterStart.length}`);
        if (audibleAfterStart.length > 0) {
            console.log(`Audible tab IDs: ${audibleAfterStart.map(t => t.id).join(', ')}`);
        } else {
            console.log(`SKIP: No tabs marked as audible (expected in headless Chrome without audio hardware)`);
            // In headless mode, skip the rest of this test
            return;
        }

        // Only continue if we have audible tabs (live browser with audio)
        expect(audibleAfterStart.length).toBeGreaterThan(0);
        expect(audibleAfterStart[0].id).toBe(tabIds[0]);

        // Switch back to tab 2 (non-audio tab)
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[2]}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify we're back on tab 2
        const beforeGxp = await getActiveTab(bgWs);
        console.log(`Before gxp: active tab is ${beforeGxp.id} (should be ${tabIds[2]})`);
        expect(beforeGxp.id).toBe(tabIds[2]);

        // Reconnect to the current active tab
        const beforeGxpPageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        const beforeGxpPageWs = await connectToCDP(beforeGxpPageWsUrl);
        enableInputDomain(beforeGxpPageWs);
        await waitForSurfingkeysReady(beforeGxpPageWs);

        // Press 'gxp' to close playing tab
        await sendKey(beforeGxpPageWs, 'g', 50);
        await sendKey(beforeGxpPageWs, 'x', 50);
        await sendKey(beforeGxpPageWs, 'p');

        await closeCDP(beforeGxpPageWs);

        // Poll for tab closure after gxp
        let tabClosed = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const exists = await tabExists(bgWs, tabIds[0]);
            if (!exists) {
                tabClosed = true;
                break;
            }
        }

        expect(tabClosed).toBe(true);
        console.log(`After gxp: tab ${tabIds[0]} was closed`);

        // Verify the audible tab was closed
        const finalExists = await tabExists(bgWs, tabIds[0]);
        expect(finalExists).toBe(false);

        // Verify other tabs still exist
        for (let i = 1; i < tabIds.length; i++) {
            const exists = await tabExists(bgWs, tabIds[i]);
            expect(exists).toBe(true);
        }

        // Verify tab count decreased by 1
        const finalTabs = await getAllTabs(bgWs);
        console.log(`Final tab count: ${finalTabs.length}`);
        expect(finalTabs.length).toBe(initialTabs.length - 1);

        // Verify no more audible tabs
        const audibleAfter = await getAudibleTabs(bgWs);
        console.log(`Audible tabs after gxp: ${audibleAfter.length}`);
        expect(audibleAfter.length).toBe(0);
    });

    test('pressing gxp with multiple audible tabs closes the first audible tab', async () => {
        // NOTE: This test may skip in headless Chrome without audio hardware

        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: ${initialTab.id}`);

        // Get initial tab count
        const initialTabs = await getAllTabs(bgWs);
        console.log(`Initial tab count: ${initialTabs.length}`);

        // Start audio in tab 0
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[0]}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        const audioPageWs0 = await connectToCDP(await findContentPage('127.0.0.1:9873/audio-test.html'));
        enableInputDomain(audioPageWs0);
        await startAudioInTab(audioPageWs0);
        await closeCDP(audioPageWs0);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Start audio in tab 4
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[4]}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        const audioPageWs4 = await connectToCDP(await findContentPage('127.0.0.1:9873/audio-test.html'));
        enableInputDomain(audioPageWs4);
        await startAudioInTab(audioPageWs4);
        await closeCDP(audioPageWs4);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify multiple tabs are audible
        const audibleTabs = await getAudibleTabs(bgWs);
        console.log(`Audible tabs: ${audibleTabs.length}, IDs: ${audibleTabs.map(t => t.id).join(', ')}`);

        if (audibleTabs.length === 0) {
            console.log(`SKIP: No tabs marked as audible (expected in headless Chrome)`);
            return;
        }

        expect(audibleTabs.length).toBeGreaterThan(0);
        const firstAudibleTabId = audibleTabs[0].id;
        console.log(`First audible tab: ${firstAudibleTabId}`);

        // Switch back to tab 2
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[2]}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect and send gxp
        const testPageWs = await connectToCDP(await findContentPage('127.0.0.1:9873/scroll-test.html'));
        enableInputDomain(testPageWs);
        await waitForSurfingkeysReady(testPageWs);

        await sendKey(testPageWs, 'g', 50);
        await sendKey(testPageWs, 'x', 50);
        await sendKey(testPageWs, 'p');

        await closeCDP(testPageWs);

        // Poll for tab closure
        let tabClosed = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const exists = await tabExists(bgWs, firstAudibleTabId);
            if (!exists) {
                tabClosed = true;
                break;
            }
        }

        expect(tabClosed).toBe(true);
        console.log(`After gxp with multiple audible tabs: first audible tab ${firstAudibleTabId} was closed`);

        // Verify the first audible tab was closed
        const closedTabExists = await tabExists(bgWs, firstAudibleTabId);
        expect(closedTabExists).toBe(false);

        // Verify tab count decreased by 1
        const finalTabs = await getAllTabs(bgWs);
        console.log(`Final tab count: ${finalTabs.length}`);
        expect(finalTabs.length).toBe(initialTabs.length - 1);

        // If there were 2 audible tabs, verify only 1 remains audible
        if (audibleTabs.length >= 2) {
            const remainingAudible = await getAudibleTabs(bgWs);
            console.log(`Remaining audible tabs: ${remainingAudible.length}`);
            expect(remainingAudible.length).toBe(audibleTabs.length - 1);
        }
    });

    test('pressing gxp when no tab is audible does nothing', async () => {
        // Get initial active tab
        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: ${initialTab.id}`);

        // Get initial tab count
        const initialTabs = await getAllTabs(bgWs);
        console.log(`Initial tab count: ${initialTabs.length}`);

        // Verify no tabs are audible
        const audibleTabs = await getAudibleTabs(bgWs);
        console.log(`Audible tabs: ${audibleTabs.length}`);
        expect(audibleTabs.length).toBe(0);

        // Press gxp
        await sendKey(pageWs, 'g', 50);
        await sendKey(pageWs, 'x', 50);
        await sendKey(pageWs, 'p');

        // Wait a bit to see if any tab closes (none should)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check active tab is still the same
        const finalTab = await getActiveTab(bgWs);
        console.log(`After gxp with no audible tabs: ${finalTab.id} (should be same as ${initialTab.id})`);

        // Should stay on the same tab
        expect(finalTab.id).toBe(initialTab.id);

        // Verify tab count is unchanged
        const finalTabs = await getAllTabs(bgWs);
        console.log(`Final tab count: ${finalTabs.length} (should be ${initialTabs.length})`);
        expect(finalTabs.length).toBe(initialTabs.length);

        // Verify all original tabs still exist
        for (const tabId of tabIds) {
            const exists = await tabExists(bgWs, tabId);
            expect(exists).toBe(true);
        }
    });

    test('gxp closes audible tab even when different tab is active', async () => {
        // NOTE: This test may skip in headless Chrome without audio hardware
        // This test verifies that gxp closes the audible tab, not the active tab

        const initialTab = await getActiveTab(bgWs);
        console.log(`Initial tab: ${initialTab.id} (tabIds[2]=${tabIds[2]})`);
        expect(initialTab.id).toBe(tabIds[2]);

        // Get initial tab count
        const initialTabs = await getAllTabs(bgWs);
        console.log(`Initial tab count: ${initialTabs.length}`);

        // Start audio in tab 0
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[0]}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        const audioPageWs = await connectToCDP(await findContentPage('127.0.0.1:9873/audio-test.html'));
        enableInputDomain(audioPageWs);
        await startAudioInTab(audioPageWs);
        await closeCDP(audioPageWs);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify tab 0 is audible
        const audibleTabs = await getAudibleTabs(bgWs);
        console.log(`Audible tabs: ${audibleTabs.map(t => `id=${t.id}, index=${t.index}`).join(', ')}`);

        if (audibleTabs.length === 0) {
            console.log(`SKIP: No tabs marked as audible (expected in headless Chrome)`);
            return;
        }

        expect(audibleTabs.length).toBeGreaterThan(0);
        expect(audibleTabs[0].id).toBe(tabIds[0]);

        // Switch to tab 3 (not tab 2, not tab 0 - different from both audible and initial)
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[3]}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify we're on tab 3
        const beforeGxp = await getActiveTab(bgWs);
        console.log(`Before gxp: active tab is ${beforeGxp.id} (should be ${tabIds[3]})`);
        expect(beforeGxp.id).toBe(tabIds[3]);

        // Reconnect to tab 3
        const testPageWs = await connectToCDP(await findContentPage('127.0.0.1:9873/scroll-test.html'));
        enableInputDomain(testPageWs);
        await waitForSurfingkeysReady(testPageWs);

        // Press gxp - should close tab 0 (audible), not tab 3 (active)
        await sendKey(testPageWs, 'g', 50);
        await sendKey(testPageWs, 'x', 50);
        await sendKey(testPageWs, 'p');

        await closeCDP(testPageWs);

        // Poll for tab closure
        let tabClosed = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const exists = await tabExists(bgWs, tabIds[0]);
            if (!exists) {
                tabClosed = true;
                break;
            }
        }

        expect(tabClosed).toBe(true);
        console.log(`After gxp: audible tab ${tabIds[0]} was closed`);

        // Verify the audible tab was closed (tab 0)
        const audibleTabExists = await tabExists(bgWs, tabIds[0]);
        expect(audibleTabExists).toBe(false);

        // Verify the active tab still exists (tab 3)
        const activeTabExists = await tabExists(bgWs, tabIds[3]);
        expect(activeTabExists).toBe(true);

        // Verify we're still on tab 3 (or another valid tab, since tab order might have changed)
        const afterGxp = await getActiveTab(bgWs);
        console.log(`After gxp: active tab is ${afterGxp.id}`);
        expect(afterGxp.id).not.toBe(tabIds[0]); // Not the closed audible tab

        // Verify tab count decreased by 1
        const finalTabs = await getAllTabs(bgWs);
        console.log(`Final tab count: ${finalTabs.length}`);
        expect(finalTabs.length).toBe(initialTabs.length - 1);
    });

    test('gxp closes tab and remaining tabs still exist', async () => {
        // NOTE: This test may skip in headless Chrome without audio hardware

        // Start audio in tab 4 (last tab)
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[4]}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        const audioPageWs = await connectToCDP(await findContentPage('127.0.0.1:9873/audio-test.html'));
        enableInputDomain(audioPageWs);
        await startAudioInTab(audioPageWs);
        await closeCDP(audioPageWs);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify tab 4 is audible
        const audibleTabs = await getAudibleTabs(bgWs);
        console.log(`Audible tabs: ${audibleTabs.length}, IDs: ${audibleTabs.map(t => t.id).join(', ')}`);

        if (audibleTabs.length === 0) {
            console.log(`SKIP: No tabs marked as audible (expected in headless Chrome)`);
            return;
        }

        expect(audibleTabs.length).toBeGreaterThan(0);
        expect(audibleTabs[0].id).toBe(tabIds[4]);

        // Switch back to tab 2
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${tabIds[2]}, { active: true }, () => resolve(true));
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reconnect and send gxp
        const testPageWs = await connectToCDP(await findContentPage('127.0.0.1:9873/scroll-test.html'));
        enableInputDomain(testPageWs);
        await waitForSurfingkeysReady(testPageWs);

        await sendKey(testPageWs, 'g', 50);
        await sendKey(testPageWs, 'x', 50);
        await sendKey(testPageWs, 'p');

        await closeCDP(testPageWs);

        // Poll for tab closure
        let tabClosed = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const exists = await tabExists(bgWs, tabIds[4]);
            if (!exists) {
                tabClosed = true;
                break;
            }
        }

        expect(tabClosed).toBe(true);
        console.log(`After gxp: tab ${tabIds[4]} was closed`);

        // Verify tab 4 was closed
        const closedTabExists = await tabExists(bgWs, tabIds[4]);
        expect(closedTabExists).toBe(false);

        // Verify all other tabs still exist
        for (let i = 0; i < 4; i++) {
            const exists = await tabExists(bgWs, tabIds[i]);
            console.log(`Tab ${i} (id=${tabIds[i]}) exists: ${exists}`);
            expect(exists).toBe(true);
        }
    });
});
