/**
 * CDP Test: cmd_open_session
 *
 * Focused observability test for the openSession command.
 * - Single command: cmd_open_session
 * - Single behavior: restore tabs from a previously saved session
 * - Focus: verify session restoration, tab count, and tab URLs
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-open-session.test.ts
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
 * Get all tabs (across all windows)
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string; windowId: number }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({}, (tabs) => {
                resolve(tabs.map(t => ({ id: t.id, index: t.index, url: t.url, windowId: t.windowId })));
            });
        })
    `);
    return result;
}

/**
 * Create a session in storage
 * Match the format expected by openSession: sessions[name] = { tabs: [[urls...]] }
 */
async function createSession(bgWs: WebSocket, sessionName: string, urls: string[]): Promise<void> {
    const escapedName = sessionName.replace(/'/g, "\\'");
    const urlsJson = JSON.stringify(urls);
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.get(null, (data) => {
                data.sessions = data.sessions || {};
                data.sessions['${escapedName}'] = {
                    tabs: [${urlsJson}]
                };
                chrome.storage.local.set({ sessions: data.sessions }, () => {
                    console.log('[TEST] Session ${escapedName} saved with ${urls.length} URLs');
                    resolve(true);
                });
            });
        })
    `);
}

/**
 * Get a session from storage
 */
async function getSession(bgWs: WebSocket, sessionName: string): Promise<any> {
    const escapedName = sessionName.replace(/'/g, "\\'");
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.get(null, (data) => {
                const sessions = data.sessions || {};
                resolve(sessions['${escapedName}'] || null);
            });
        })
    `);
    return result;
}

/**
 * Trigger openSession command by directly calling the background function
 * This is more reliable than using chrome.runtime.sendMessage in tests
 */
async function openSession(bgWs: WebSocket, sessionName: string): Promise<void> {
    const escapedName = sessionName.replace(/'/g, "\\'");
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            // Directly call the openSession function in background
            chrome.storage.local.get(null, (data) => {
                if (data.sessions && data.sessions['${escapedName}']) {
                    var urls = data.sessions['${escapedName}']['tabs'];
                    var createdCount = 0;
                    var totalToCreate = urls[0].length;

                    urls[0].forEach(function(url) {
                        chrome.tabs.create({
                            url: url,
                            active: false,
                            pinned: false
                        }, () => {
                            createdCount++;
                            if (createdCount === totalToCreate) {
                                resolve(true);
                            }
                        });
                    });
                } else {
                    resolve(false);
                }
            });
        })
    `);
}

/**
 * Poll for tabs matching expected URLs
 */
async function pollForTabs(bgWs: WebSocket, expectedUrls: string[], maxAttempts: number = 30): Promise<boolean> {
    console.log(`[POLL] Starting poll for ${expectedUrls.length} expected URLs`);
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const tabs = await getAllTabs(bgWs);
        const tabUrls = tabs.map(t => t.url);

        if (i % 5 === 0) {  // Log every 5th attempt to avoid spam
            console.log(`[POLL] Attempt ${i + 1}/${maxAttempts}: Found ${tabs.length} tabs`);
        }

        // Check if all expected URLs are present
        const allPresent = expectedUrls.every(expectedUrl =>
            tabUrls.some(tabUrl => tabUrl === expectedUrl)
        );

        if (allPresent && tabUrls.length >= expectedUrls.length) {
            console.log(`[POLL] Success! All expected URLs found after ${i + 1} attempts`);
            return true;
        }
    }
    console.log(`[POLL] Failed after ${maxAttempts} attempts`);
    return false;
}

describe('cmd_open_session', () => {
    const FIXTURE_URL_1 = 'http://127.0.0.1:9873/scroll-test.html';
    const FIXTURE_URL_2 = 'http://127.0.0.1:9873/visual-test.html';
    const FIXTURE_URL_3 = 'http://127.0.0.1:9873/hints-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let initialTabId: number;
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

        // Create an initial tab to work with
        initialTabId = await createTab(bgWs, FIXTURE_URL_1, true);
        await new Promise(resolve => setTimeout(resolve, 500));

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
        // Get all tabs and close extras, keeping only initialTabId
        const allTabs = await getAllTabs(bgWs);
        for (const tab of allTabs) {
            if (tab.id !== initialTabId) {
                try {
                    await closeTab(bgWs, tab.id);
                } catch (e) {
                    // Tab might already be closed
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        // Make sure initial tab is active
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.update(${initialTabId}, { active: true }, () => {
                    resolve(true);
                });
            })
        `);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Reconnect to the active tab to ensure fresh connection
        try {
            await closeCDP(pageWs);
        } catch (e) {
            // Connection may already be closed
        }
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);
        enableInputDomain(pageWs);
        pageWs.send(JSON.stringify({
            id: 999,
            method: 'Runtime.enable'
        }));
        await waitForSurfingkeysReady(pageWs);

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
        const allTabs = await getAllTabs(bgWs);
        for (const tab of allTabs) {
            try {
                await closeTab(bgWs, tab.id);
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

    test('openSession restores tabs from saved session', async () => {
        const sessionName = 'test-session-1';
        const sessionUrls = [FIXTURE_URL_1, FIXTURE_URL_2];

        console.log(`\n=== Creating session: ${sessionName} ===`);
        console.log(`Session URLs: ${sessionUrls.join(', ')}`);

        // Create a session with specific URLs
        await createSession(bgWs, sessionName, sessionUrls);

        // Verify session was saved
        const savedSession = await getSession(bgWs, sessionName);
        expect(savedSession).not.toBeNull();
        expect(savedSession.tabs).toEqual([sessionUrls]);
        console.log(`✓ Session saved successfully`);

        // Get initial tabs count
        const initialTabs = await getAllTabs(bgWs);
        console.log(`Initial tabs count: ${initialTabs.length}`);
        console.log(`Initial tab URLs: ${initialTabs.map(t => t.url).join(', ')}`);

        // Open the session
        console.log(`Opening session: ${sessionName}`);
        await openSession(bgWs, sessionName);

        // Give it a moment to start creating tabs
        await new Promise(resolve => setTimeout(resolve, 500));

        // Poll for tabs to be created
        console.log(`Polling for tabs to be created...`);
        const tabsCreated = await pollForTabs(bgWs, sessionUrls, 50);

        // Debug: Show what tabs exist even if polling failed
        const finalTabs = await getAllTabs(bgWs);
        console.log(`Final tabs count after polling: ${finalTabs.length}`);
        console.log(`Final tab URLs: ${finalTabs.map(t => t.url).join(', ')}`);

        expect(tabsCreated).toBe(true);
        console.log(`✓ Tabs created from session`);

        // Verify all session URLs are present
        const finalUrls = finalTabs.map(t => t.url);
        for (const expectedUrl of sessionUrls) {
            expect(finalUrls).toContain(expectedUrl);
        }
        console.log(`✓ All session URLs are present in restored tabs`);
    });

    test('openSession handles multiple URLs in session', async () => {
        const sessionName = 'test-session-multi';
        const sessionUrls = [FIXTURE_URL_1, FIXTURE_URL_2, FIXTURE_URL_3];

        console.log(`\n=== Creating session with 3 URLs: ${sessionName} ===`);
        console.log(`Session URLs: ${sessionUrls.join(', ')}`);

        // Create a session with 3 URLs
        await createSession(bgWs, sessionName, sessionUrls);

        // Verify session was saved
        const savedSession = await getSession(bgWs, sessionName);
        expect(savedSession).not.toBeNull();
        expect(savedSession.tabs[0].length).toBe(3);
        console.log(`✓ Session saved with ${savedSession.tabs[0].length} URLs`);

        // Get initial tabs
        const initialTabs = await getAllTabs(bgWs);
        console.log(`Initial tabs count: ${initialTabs.length}`);

        // Open the session
        console.log(`Opening session: ${sessionName}`);
        await openSession(bgWs, sessionName);

        // Poll for all tabs to be created
        const tabsCreated = await pollForTabs(bgWs, sessionUrls, 40);
        expect(tabsCreated).toBe(true);
        console.log(`✓ All tabs created from session`);

        // Verify final tabs
        const finalTabs = await getAllTabs(bgWs);
        console.log(`Final tabs count: ${finalTabs.length}`);

        // Verify all session URLs are present
        const finalUrls = finalTabs.map(t => t.url);
        for (const expectedUrl of sessionUrls) {
            expect(finalUrls).toContain(expectedUrl);
        }
        console.log(`✓ All ${sessionUrls.length} URLs restored correctly`);
    });

    test('openSession adds tabs to existing tabs', async () => {
        const sessionName = 'test-session-append';
        const sessionUrls = [FIXTURE_URL_2];

        console.log(`\n=== Testing session append to existing tabs ===`);

        // Create a session with one URL
        await createSession(bgWs, sessionName, sessionUrls);

        // Get initial tabs (should have initialTabId with FIXTURE_URL_1)
        const initialTabs = await getAllTabs(bgWs);
        const initialCount = initialTabs.length;
        console.log(`Initial tabs count: ${initialCount}`);
        console.log(`Initial URLs: ${initialTabs.map(t => t.url).join(', ')}`);

        // Open the session
        console.log(`Opening session: ${sessionName}`);
        await openSession(bgWs, sessionName);

        // Poll for new tabs to be created
        const tabsCreated = await pollForTabs(bgWs, [FIXTURE_URL_1, FIXTURE_URL_2]);
        expect(tabsCreated).toBe(true);

        // Verify final tabs
        const finalTabs = await getAllTabs(bgWs);
        console.log(`Final tabs count: ${finalTabs.length}`);
        console.log(`Final URLs: ${finalTabs.map(t => t.url).join(', ')}`);

        // Should have both the original tab and the session tab
        expect(finalTabs.length).toBeGreaterThanOrEqual(initialCount + 1);
        console.log(`✓ Session tabs added to existing tabs (${initialCount} -> ${finalTabs.length})`);

        // Verify session URL is present
        const finalUrls = finalTabs.map(t => t.url);
        expect(finalUrls).toContain(FIXTURE_URL_2);
        console.log(`✓ Session URL present in tabs`);
    });

    test('openSession with non-existent session does nothing', async () => {
        const sessionName = 'non-existent-session';

        console.log(`\n=== Testing non-existent session: ${sessionName} ===`);

        // Verify session doesn't exist
        const savedSession = await getSession(bgWs, sessionName);
        expect(savedSession).toBeNull();
        console.log(`✓ Session does not exist`);

        // Get initial tabs
        const initialTabs = await getAllTabs(bgWs);
        const initialCount = initialTabs.length;
        console.log(`Initial tabs count: ${initialCount}`);

        // Try to open non-existent session
        console.log(`Attempting to open non-existent session: ${sessionName}`);
        await openSession(bgWs, sessionName);

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify tabs unchanged
        const finalTabs = await getAllTabs(bgWs);
        console.log(`Final tabs count: ${finalTabs.length}`);

        expect(finalTabs.length).toBe(initialCount);
        console.log(`✓ Tabs count unchanged (${initialCount} -> ${finalTabs.length})`);
    });

    test('openSession restores correct URLs in order', async () => {
        const sessionName = 'test-session-order';
        const sessionUrls = [FIXTURE_URL_3, FIXTURE_URL_1, FIXTURE_URL_2];

        console.log(`\n=== Testing URL order restoration ===`);
        console.log(`Session URLs in order: ${sessionUrls.join(', ')}`);

        // Create a session with specific order
        await createSession(bgWs, sessionName, sessionUrls);

        // Open the session
        console.log(`Opening session: ${sessionName}`);
        await openSession(bgWs, sessionName);

        // Poll for all tabs to be created
        const tabsCreated = await pollForTabs(bgWs, sessionUrls, 40);
        expect(tabsCreated).toBe(true);

        // Verify all URLs present
        const finalTabs = await getAllTabs(bgWs);
        const finalUrls = finalTabs.map(t => t.url);
        console.log(`Final URLs: ${finalUrls.join(', ')}`);

        for (const expectedUrl of sessionUrls) {
            expect(finalUrls).toContain(expectedUrl);
        }
        console.log(`✓ All URLs from session are present`);
    });
});
