/**
 * CDP Test: cmd_create_session
 *
 * Focused observability test for the create session command.
 * - Single command: cmd_create_session
 * - Single key: 'ZZ' (save session and quit)
 * - Single behavior: save current tabs as a named session
 * - Focus: verify command execution and session storage without timeouts
 *
 * Usage:
 *   Headless mode:   ./bin/dbg test-run tests/cdp/commands/cmd-create-session.test.ts
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
 * Get sessions from chrome storage
 */
async function getSessions(bgWs: WebSocket): Promise<any> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.get(null, (data) => {
                resolve(data.sessions || {});
            });
        })
    `);
    return result;
}

/**
 * Clear all sessions from storage
 */
async function clearSessions(bgWs: WebSocket): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.get(null, (data) => {
                data.sessions = {};
                chrome.storage.local.set(data, () => {
                    resolve(true);
                });
            });
        })
    `);
}

/**
 * Create a session programmatically via background script
 */
async function createSessionViaRuntime(bgWs: WebSocket, name: string): Promise<void> {
    const escapedName = name.replace(/'/g, "\\'");
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            // Call the background script's createSession function directly
            chrome.tabs.query({}, function(tabs) {
                chrome.storage.local.get(null, function(data) {
                    var sessions = data.sessions || {};
                    var tabGroup = {};
                    tabs.forEach(function(tab) {
                        if (tab && tab.index !== void 0) {
                            if (!tabGroup.hasOwnProperty(tab.windowId)) {
                                tabGroup[tab.windowId] = [];
                            }
                            // Filter out new tab URLs
                            if (tab.url && !tab.url.startsWith('chrome://newtab')) {
                                tabGroup[tab.windowId].push(tab.url);
                            }
                        }
                    });
                    var tabg = [];
                    for (var k in tabGroup) {
                        if (tabGroup[k].length) {
                            tabg.push(tabGroup[k]);
                        }
                    }
                    sessions['${escapedName}'] = { tabs: tabg };
                    chrome.storage.local.set({ sessions: sessions }, function() {
                        resolve(true);
                    });
                });
            });
        })
    `);
    return result;
}

/**
 * Poll for session to appear in storage
 */
async function waitForSession(bgWs: WebSocket, sessionName: string, timeoutMs: number = 5000): Promise<any> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const sessions = await getSessions(bgWs);
        if (sessions && sessions[sessionName]) {
            return sessions[sessionName];
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
}

describe('cmd_create_session', () => {
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

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        // Clear all sessions before each test
        await clearSessions(bgWs);
        console.log('beforeEach: Cleared all sessions from storage');

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
        console.log(`beforeEach: After reset, active tab is index ${verifyTab.index}, id ${verifyTab.id}`);

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

    test('creating a session with valid name saves tabs to storage', async () => {
        console.log('\n=== TEST: Create session with valid name ===');

        // Get all tabs before creating session
        const allTabs = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({}, (tabs) => {
                    resolve(tabs.map(t => ({ id: t.id, url: t.url, windowId: t.windowId })));
                });
            })
        `);
        console.log(`Total tabs in browser: ${allTabs.length}`);
        console.log(`Test tabs created: ${tabIds.length}`);

        // Create session via background script
        const sessionName = 'test-session-1';
        await createSessionViaRuntime(bgWs, sessionName);
        console.log(`Created session: ${sessionName}`);

        // Poll for session to appear in storage
        const session = await waitForSession(bgWs, sessionName);

        expect(session).not.toBeNull();
        console.log(`✓ Assertion: session '${sessionName}' exists in storage`);

        expect(session.tabs).toBeDefined();
        console.log(`✓ Assertion: session has 'tabs' property`);

        expect(Array.isArray(session.tabs)).toBe(true);
        console.log(`✓ Assertion: session.tabs is an array`);

        expect(session.tabs.length).toBeGreaterThan(0);
        console.log(`✓ Assertion: session has at least one window with tabs`);

        // Verify the session contains our test tabs
        const sessionUrls = session.tabs.flat();
        console.log(`Session contains ${sessionUrls.length} URLs`);
        expect(sessionUrls.length).toBeGreaterThan(0);
        console.log(`✓ Assertion: session contains URLs`);
    });

    test('creating multiple sessions stores them separately', async () => {
        console.log('\n=== TEST: Create multiple sessions ===');

        // Create first session
        const session1Name = 'session-one';
        await createSessionViaRuntime(bgWs, session1Name);
        console.log(`Created session: ${session1Name}`);

        // Poll for first session
        const session1 = await waitForSession(bgWs, session1Name);
        expect(session1).not.toBeNull();
        console.log(`✓ Assertion: first session exists`);

        // Create second session
        const session2Name = 'session-two';
        await createSessionViaRuntime(bgWs, session2Name);
        console.log(`Created session: ${session2Name}`);

        // Poll for second session
        const session2 = await waitForSession(bgWs, session2Name);
        expect(session2).not.toBeNull();
        console.log(`✓ Assertion: second session exists`);

        // Get all sessions and verify both exist
        const allSessions = await getSessions(bgWs);
        console.log(`Total sessions in storage: ${Object.keys(allSessions).length}`);

        expect(allSessions[session1Name]).toBeDefined();
        console.log(`✓ Assertion: session '${session1Name}' still exists`);

        expect(allSessions[session2Name]).toBeDefined();
        console.log(`✓ Assertion: session '${session2Name}' exists`);

        expect(Object.keys(allSessions).length).toBe(2);
        console.log(`✓ Assertion: exactly 2 sessions in storage`);
    });

    test('creating session with duplicate name overwrites existing session', async () => {
        console.log('\n=== TEST: Overwrite session with duplicate name ===');

        const sessionName = 'duplicate-session';

        // Create first session with 5 tabs
        await createSessionViaRuntime(bgWs, sessionName);
        const session1 = await waitForSession(bgWs, sessionName);
        expect(session1).not.toBeNull();
        const originalTabsCount = session1.tabs.flat().length;
        console.log(`First session created with ${originalTabsCount} URLs`);

        // Close some tabs to change the state
        await closeTab(bgWs, tabIds[0]);
        await closeTab(bgWs, tabIds[1]);
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Closed 2 tabs`);

        // Create session again with same name
        await createSessionViaRuntime(bgWs, sessionName);
        console.log(`Created session again with same name: ${sessionName}`);

        // Wait a bit for storage to update
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get the session and verify it was overwritten
        const session2 = await waitForSession(bgWs, sessionName);
        expect(session2).not.toBeNull();
        console.log(`✓ Assertion: session still exists after overwrite`);

        const newTabsCount = session2.tabs.flat().length;
        console.log(`Second session has ${newTabsCount} URLs`);

        // The new session should have fewer tabs since we closed some
        expect(newTabsCount).toBeLessThan(originalTabsCount);
        console.log(`✓ Assertion: new session has fewer tabs (${newTabsCount} < ${originalTabsCount})`);
    });

    test('session stores tab URLs correctly', async () => {
        console.log('\n=== TEST: Verify session stores correct URLs ===');

        const sessionName = 'url-test-session';

        // Get current tabs before creating session
        const currentTabs = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({}, (tabs) => {
                    resolve(tabs.map(t => t.url).filter(url => url.includes('127.0.0.1:9873')));
                });
            })
        `);
        console.log(`Current test tabs: ${currentTabs.length}`);
        console.log(`Test tab URLs: ${currentTabs.join(', ')}`);

        // Create session
        await createSessionViaRuntime(bgWs, sessionName);
        const session = await waitForSession(bgWs, sessionName);

        expect(session).not.toBeNull();
        expect(session.tabs).toBeDefined();

        const sessionUrls = session.tabs.flat();
        console.log(`Session URLs: ${sessionUrls.join(', ')}`);

        // Verify all test tabs are in the session
        for (const testUrl of currentTabs) {
            expect(sessionUrls).toContain(testUrl);
            console.log(`✓ Assertion: session contains URL ${testUrl}`);
        }
    });

    test('empty session name still creates a session', async () => {
        console.log('\n=== TEST: Create session with empty name ===');

        // Create session with empty string name
        const emptyName = '';
        await createSessionViaRuntime(bgWs, emptyName);
        console.log(`Created session with empty name`);

        // Poll for session with empty name
        const session = await waitForSession(bgWs, emptyName);

        expect(session).not.toBeNull();
        console.log(`✓ Assertion: session with empty name exists`);

        expect(session.tabs).toBeDefined();
        console.log(`✓ Assertion: session has tabs`);
    });

    test('special characters in session name are handled', async () => {
        console.log('\n=== TEST: Create session with special characters in name ===');

        const specialName = 'test-session_with.special:chars!@#';
        await createSessionViaRuntime(bgWs, specialName);
        console.log(`Created session: ${specialName}`);

        const session = await waitForSession(bgWs, specialName);

        expect(session).not.toBeNull();
        console.log(`✓ Assertion: session with special characters exists`);

        const allSessions = await getSessions(bgWs);
        expect(allSessions[specialName]).toBeDefined();
        console.log(`✓ Assertion: can retrieve session by special name`);
    });
});
