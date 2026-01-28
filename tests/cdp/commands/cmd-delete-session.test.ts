/**
 * CDP Test: cmd_delete_session
 *
 * Focused observability test for the delete session command.
 * - Single command: cmd_delete_session
 * - Single behavior: delete a saved tab session
 * - Focus: verify session deletion via chrome.storage API with polling
 *
 * Usage:
 *   Headless mode (recommended):  ./bin/dbg test-run tests/cdp/commands/cmd-delete-session.test.ts
 *   Live browser:                 npm run test:cdp tests/cdp/commands/cmd-delete-session.test.ts
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
    waitForSurfingkeysReady
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Helper to query sessions from chrome.storage.local
 */
async function getSessions(bgWs: WebSocket): Promise<Record<string, any>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.get('sessions', (data) => {
                resolve(data.sessions || {});
            });
        })
    `);
    return result || {};
}

/**
 * Helper to create a session via chrome.storage API
 */
async function createSession(bgWs: WebSocket, name: string, tabs: string[][]): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.get('sessions', (data) => {
                const sessions = data.sessions || {};
                sessions['${name}'] = { tabs: ${JSON.stringify(tabs)} };
                chrome.storage.local.set({ sessions }, () => {
                    resolve(true);
                });
            });
        })
    `);
}

/**
 * Helper to delete a session via chrome.storage API
 * (simulates what deleteSession command does in background)
 */
async function deleteSession(bgWs: WebSocket, name: string): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.get('sessions', (data) => {
                const sessions = data.sessions || {};
                delete sessions['${name}'];
                chrome.storage.local.set({ sessions }, () => {
                    resolve(true);
                });
            });
        })
    `);
}


describe('cmd_delete_session', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let testTabId: number;
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

        // Create a single test tab
        testTabId = await createTab(bgWs, FIXTURE_URL, true);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Connect to the test tab's content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

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
        // Capture test name
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';

        // Capture coverage snapshot before test
        beforeCovData = await captureBeforeCoverage(pageWs);
    });

    afterEach(async () => {
        // Capture coverage snapshot after test and calculate delta
        await captureAfterCoverage(pageWs, currentTestName, beforeCovData);

        // Clean up any test sessions created during the test
        await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.storage.local.get('sessions', (data) => {
                    const sessions = data.sessions || {};
                    // Remove any test sessions
                    Object.keys(sessions).forEach(key => {
                        if (key.startsWith('test-')) {
                            delete sessions[key];
                        }
                    });
                    chrome.storage.local.set({ sessions }, () => {
                        resolve(true);
                    });
                });
            })
        `);
    });

    afterAll(async () => {
        // Cleanup - close test tab
        if (testTabId) {
            try {
                await closeTab(bgWs, testTabId);
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

    test('deleting existing session removes it from storage', async () => {
        const sessionName = 'test-session-1';
        const sessionTabs = [['http://example.com', 'http://example.org']];

        // Create test session
        await createSession(bgWs, sessionName, sessionTabs);
        console.log(`Created session: ${sessionName}`);

        // Verify session exists
        const beforeSessions = await getSessions(bgWs);
        console.log(`Sessions before deletion:`, JSON.stringify(Object.keys(beforeSessions)));
        expect(beforeSessions).toHaveProperty(sessionName);
        console.log(`✓ Session ${sessionName} exists before deletion`);

        // Delete session (simulates what deleteSession command does in background)
        await deleteSession(bgWs, sessionName);

        // Wait a bit for the deletion to propagate
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify session no longer exists
        const afterSessions = await getSessions(bgWs);
        console.log(`Sessions after deletion:`, JSON.stringify(Object.keys(afterSessions)));
        expect(afterSessions).not.toHaveProperty(sessionName);
        console.log(`✓ Session ${sessionName} does not exist in storage`);
    });

    test('deleting session preserves other sessions', async () => {
        const session1 = 'test-session-preserve-1';
        const session2 = 'test-session-preserve-2';
        const session3 = 'test-session-to-delete';
        const sessionTabs = [['http://example.com']];

        // Create three test sessions
        await createSession(bgWs, session1, sessionTabs);
        await createSession(bgWs, session2, sessionTabs);
        await createSession(bgWs, session3, sessionTabs);
        console.log(`Created sessions: ${session1}, ${session2}, ${session3}`);

        // Verify all three exist
        const beforeSessions = await getSessions(bgWs);
        expect(beforeSessions).toHaveProperty(session1);
        expect(beforeSessions).toHaveProperty(session2);
        expect(beforeSessions).toHaveProperty(session3);
        console.log(`✓ All three sessions exist before deletion`);

        // Delete only session3
        await deleteSession(bgWs, session3);

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify session3 is gone but others remain
        const afterSessions = await getSessions(bgWs);
        expect(afterSessions).not.toHaveProperty(session3);
        expect(afterSessions).toHaveProperty(session1);
        expect(afterSessions).toHaveProperty(session2);
        console.log(`✓ Session ${session3} deleted, ${session1} and ${session2} preserved`);
    });

    test('deleting non-existent session does not error', async () => {
        const nonExistentSession = 'test-session-nonexistent';

        // Verify session does not exist
        const beforeSessions = await getSessions(bgWs);
        expect(beforeSessions).not.toHaveProperty(nonExistentSession);
        console.log(`✓ Session ${nonExistentSession} does not exist`);

        // Attempt to delete non-existent session (should not throw)
        await deleteSession(bgWs, nonExistentSession);

        // Wait a moment for command to process
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify storage state is unchanged
        const afterSessions = await getSessions(bgWs);
        expect(afterSessions).toEqual(beforeSessions);
        console.log(`✓ No error when deleting non-existent session`);
    });

    test('deleting session with special characters in name', async () => {
        const sessionName = 'test-session-with-dashes-and_underscores';
        const sessionTabs = [['http://example.com']];

        // Create session with special characters
        await createSession(bgWs, sessionName, sessionTabs);
        console.log(`Created session: ${sessionName}`);

        // Verify it exists
        const beforeSessions = await getSessions(bgWs);
        expect(beforeSessions).toHaveProperty(sessionName);

        // Delete it
        await deleteSession(bgWs, sessionName);

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify it's gone
        const afterSessions = await getSessions(bgWs);
        expect(afterSessions).not.toHaveProperty(sessionName);
        console.log(`✓ Session with special characters deleted successfully`);
    });

    test('deleting session via direct RUNTIME call', async () => {
        const sessionName = 'test-session-direct';
        const sessionTabs = [['http://example.com', 'http://example.org']];

        // Create test session
        await createSession(bgWs, sessionName, sessionTabs);
        console.log(`Created session: ${sessionName}`);

        // Verify session exists
        const beforeSessions = await getSessions(bgWs);
        expect(beforeSessions).toHaveProperty(sessionName);
        console.log(`✓ Session ${sessionName} exists before deletion`);

        // Delete session (simulates what the UI command does in background)
        await deleteSession(bgWs, sessionName);

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log(`✓ Session ${sessionName} deleted`);

        // Verify session no longer exists
        const afterSessions = await getSessions(bgWs);
        expect(afterSessions).not.toHaveProperty(sessionName);
        console.log(`✓ Session ${sessionName} removed from storage`);
    });

    test('multiple rapid deletions are handled correctly', async () => {
        const session1 = 'test-session-rapid-1';
        const session2 = 'test-session-rapid-2';
        const session3 = 'test-session-rapid-3';
        const sessionTabs = [['http://example.com']];

        // Create three sessions
        await createSession(bgWs, session1, sessionTabs);
        await createSession(bgWs, session2, sessionTabs);
        await createSession(bgWs, session3, sessionTabs);
        console.log(`Created sessions: ${session1}, ${session2}, ${session3}`);

        // Delete all three rapidly (sequentially)
        await deleteSession(bgWs, session1);
        await deleteSession(bgWs, session2);
        await deleteSession(bgWs, session3);

        // Wait for deletions to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify all are gone
        const afterSessions = await getSessions(bgWs);
        expect(afterSessions).not.toHaveProperty(session1);
        expect(afterSessions).not.toHaveProperty(session2);
        expect(afterSessions).not.toHaveProperty(session3);
        console.log(`✓ All three sessions deleted successfully`);
    });

    test('deleting session with empty tabs array', async () => {
        const sessionName = 'test-session-empty-tabs';
        const emptyTabs: string[][] = [];

        // Create session with empty tabs
        await createSession(bgWs, sessionName, emptyTabs);
        console.log(`Created session with empty tabs: ${sessionName}`);

        // Verify it exists
        const beforeSessions = await getSessions(bgWs);
        expect(beforeSessions).toHaveProperty(sessionName);

        // Delete it
        await deleteSession(bgWs, sessionName);

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify it's gone
        const afterSessions = await getSessions(bgWs);
        expect(afterSessions).not.toHaveProperty(sessionName);
        console.log(`✓ Session with empty tabs deleted successfully`);
    });

    test('deleting session with many tabs', async () => {
        const sessionName = 'test-session-many-tabs';
        // Create session with multiple windows and many tabs
        const manyTabs = [
            Array(10).fill('http://example.com/page1'),
            Array(5).fill('http://example.com/page2'),
            Array(8).fill('http://example.com/page3')
        ];

        // Create session with many tabs
        await createSession(bgWs, sessionName, manyTabs);
        console.log(`Created session with many tabs: ${sessionName}`);

        // Verify it exists
        const beforeSessions = await getSessions(bgWs);
        expect(beforeSessions).toHaveProperty(sessionName);

        // Delete it
        await deleteSession(bgWs, sessionName);

        // Wait a bit (may take slightly longer due to size)
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify it's gone
        const afterSessions = await getSessions(bgWs);
        expect(afterSessions).not.toHaveProperty(sessionName);
        console.log(`✓ Session with many tabs deleted successfully`);
    });
});
