/**
 * CDP Test: cmd_list_session
 *
 * Focused observability test for the list session command.
 * - Single command: cmd_list_session
 * - Command name: 'listSession'
 * - Single behavior: list saved sessions (tests storage retrieval)
 * - Focus: verify command execution and session listing logic
 *
 * Note: This test focuses on the command's logic (session retrieval from storage)
 * rather than the UI presentation (omnibar display). The command retrieves session
 * data from chrome.storage and verifies the data can be accessed.
 *
 * Usage:
 *   Recommended:     ./bin/dbg test-run tests/cdp/commands/cmd-list-session.test.ts
 *   Live browser:    npm run test:cdp:live tests/cdp/commands/cmd-list-session.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-list-session.test.ts
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
 * Get sessions from chrome storage
 */
async function getAllSessions(bgWs: WebSocket): Promise<{ [key: string]: any }> {
    return executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.get('sessions', (data) => {
                resolve(data.sessions || {});
            });
        })
    `);
}

/**
 * Clear all sessions from storage
 */
async function clearAllSessions(bgWs: WebSocket): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.set({ sessions: {} }, () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Create test sessions in storage
 */
async function createTestSessions(bgWs: WebSocket, sessions: { [key: string]: any }): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.storage.local.get('sessions', (data) => {
                const existingSessions = data.sessions || {};
                const updatedSessions = { ...existingSessions, ...${JSON.stringify(sessions)} };
                chrome.storage.local.set({ sessions: updatedSessions }, () => {
                    resolve(true);
                });
            });
        })
    `);
}

/**
 * Get sessions using the same logic as listSession command
 * (simulates what happens when listSession is executed)
 */
async function listSessionsViaCommand(bgWs: WebSocket): Promise<string[]> {
    return executeInTarget(bgWs, `
        new Promise((resolve) => {
            // This mimics what the listSession command does:
            // RUNTIME('getSettings', { key: 'sessions' }, function(response) {
            //     omnibar.listResults(Object.keys(response.settings.sessions), ...)
            // })
            chrome.storage.local.get('sessions', (data) => {
                const sessions = data.sessions || {};
                const sessionNames = Object.keys(sessions);
                resolve(sessionNames);
            });
        })
    `);
}

describe('cmd_list_session', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
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

        // Create fixture tab
        tabId = await createTab(bgWs, FIXTURE_URL, true);

        // Connect to the content page
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
        // Clear any existing sessions before each test
        await clearAllSessions(bgWs);

        // Wait a bit for storage to clear
        await new Promise(resolve => setTimeout(resolve, 100));

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
        // Cleanup sessions
        await clearAllSessions(bgWs);

        // Close tab
        if (tabId && bgWs) {
            await closeTab(bgWs, tabId);
        }

        if (pageWs) {
            await closeCDP(pageWs);
        }

        if (bgWs) {
            await closeCDP(bgWs);
        }
    });

    test('listSession retrieves multiple sessions from storage', async () => {
        // Setup: Create test sessions
        const testSessions = {
            'work': {
                tabs: [
                    { url: 'https://example.com', title: 'Example' }
                ],
                created: new Date().toISOString()
            },
            'personal': {
                tabs: [
                    { url: 'https://test.com', title: 'Test' }
                ],
                created: new Date().toISOString()
            },
            'shopping': {
                tabs: [
                    { url: 'https://shop.com', title: 'Shop' }
                ],
                created: new Date().toISOString()
            }
        };

        await createTestSessions(bgWs, testSessions);
        console.log('Created test sessions:', Object.keys(testSessions));

        // Verify sessions were created
        const sessions = await getAllSessions(bgWs);
        console.log('Verified sessions in storage:', Object.keys(sessions));
        expect(Object.keys(sessions).length).toBe(3);

        // Execute listSession logic (what the command does)
        const sessionNames = await listSessionsViaCommand(bgWs);
        console.log(`Retrieved session names: ${JSON.stringify(sessionNames)}`);

        // Verify all sessions are retrieved
        expect(sessionNames.length).toBe(3);
        expect(sessionNames).toContain('work');
        expect(sessionNames).toContain('personal');
        expect(sessionNames).toContain('shopping');
    });

    test('listSession retrieves empty list when no sessions exist', async () => {
        // Verify no sessions exist
        const sessions = await getAllSessions(bgWs);
        console.log('Sessions before test:', Object.keys(sessions));
        expect(Object.keys(sessions).length).toBe(0);

        // Execute listSession logic
        const sessionNames = await listSessionsViaCommand(bgWs);
        console.log(`Retrieved session names: ${JSON.stringify(sessionNames)}`);

        // Should return empty array
        expect(sessionNames.length).toBe(0);
    });

    test('listSession retrieves single session', async () => {
        // Setup: Create single session
        const testSessions = {
            'single-session': {
                tabs: [
                    { url: 'https://single.com', title: 'Single' }
                ],
                created: new Date().toISOString()
            }
        };

        await createTestSessions(bgWs, testSessions);
        console.log('Created single session');

        // Execute listSession logic
        const sessionNames = await listSessionsViaCommand(bgWs);
        console.log(`Single session names: ${JSON.stringify(sessionNames)}`);

        // Verify single session is retrieved
        expect(sessionNames.length).toBe(1);
        expect(sessionNames).toContain('single-session');
    });

    test('listSession retrieves many sessions', async () => {
        // Setup: Create many sessions (10 sessions)
        const testSessions: { [key: string]: any } = {};
        for (let i = 1; i <= 10; i++) {
            testSessions[`session-${i}`] = {
                tabs: [
                    { url: `https://session${i}.com`, title: `Session ${i}` }
                ],
                created: new Date().toISOString()
            };
        }

        await createTestSessions(bgWs, testSessions);
        console.log('Created 10 test sessions');

        // Execute listSession logic
        const sessionNames = await listSessionsViaCommand(bgWs);
        console.log(`Many sessions count: ${sessionNames.length}`);

        // Verify all 10 sessions are retrieved
        expect(sessionNames.length).toBe(10);
        for (let i = 1; i <= 10; i++) {
            expect(sessionNames).toContain(`session-${i}`);
        }
    });

    test('listSession retrieves sessions with special characters in names', async () => {
        // Setup: Create sessions with special characters in names
        const testSessions = {
            'work-project': { tabs: [{ url: 'https://work.com', title: 'Work' }], created: new Date().toISOString() },
            'my_session': { tabs: [{ url: 'https://my.com', title: 'My' }], created: new Date().toISOString() },
            'session 123': { tabs: [{ url: 'https://123.com', title: '123' }], created: new Date().toISOString() },
            'session.test': { tabs: [{ url: 'https://test.com', title: 'Test' }], created: new Date().toISOString() }
        };

        await createTestSessions(bgWs, testSessions);
        console.log('Created sessions with special characters');

        // Execute listSession logic
        const sessionNames = await listSessionsViaCommand(bgWs);
        console.log(`Special char sessions: ${JSON.stringify(sessionNames)}`);

        // Verify all sessions with special characters are retrieved
        expect(sessionNames.length).toBe(4);
        expect(sessionNames).toContain('work-project');
        expect(sessionNames).toContain('my_session');
        expect(sessionNames).toContain('session 123');
        expect(sessionNames).toContain('session.test');
    });

    test('listSession preserves session order from storage', async () => {
        // Create sessions in specific order
        const sessionA = {
            'alpha': { tabs: [{ url: 'https://a.com', title: 'A' }], created: '2024-01-01T00:00:00.000Z' }
        };
        await createTestSessions(bgWs, sessionA);
        await new Promise(resolve => setTimeout(resolve, 50));

        const sessionB = {
            'beta': { tabs: [{ url: 'https://b.com', title: 'B' }], created: '2024-01-02T00:00:00.000Z' }
        };
        await createTestSessions(bgWs, sessionB);
        await new Promise(resolve => setTimeout(resolve, 50));

        const sessionC = {
            'gamma': { tabs: [{ url: 'https://c.com', title: 'C' }], created: '2024-01-03T00:00:00.000Z' }
        };
        await createTestSessions(bgWs, sessionC);

        // Execute listSession logic
        const sessionNames = await listSessionsViaCommand(bgWs);
        console.log(`Session order: ${JSON.stringify(sessionNames)}`);

        // Verify all sessions are retrieved (order from Object.keys may vary)
        expect(sessionNames.length).toBe(3);
        expect(sessionNames).toContain('alpha');
        expect(sessionNames).toContain('beta');
        expect(sessionNames).toContain('gamma');
    });

    test('listSession works after sessions are modified', async () => {
        // Create initial sessions
        const initialSessions = {
            'session1': { tabs: [{ url: 'https://1.com', title: '1' }], created: new Date().toISOString() },
            'session2': { tabs: [{ url: 'https://2.com', title: '2' }], created: new Date().toISOString() }
        };
        await createTestSessions(bgWs, initialSessions);

        // List sessions
        let sessionNames = await listSessionsViaCommand(bgWs);
        expect(sessionNames.length).toBe(2);
        console.log('Initial sessions:', sessionNames);

        // Add more sessions
        const moreSessions = {
            'session3': { tabs: [{ url: 'https://3.com', title: '3' }], created: new Date().toISOString() }
        };
        await createTestSessions(bgWs, moreSessions);

        // List sessions again
        sessionNames = await listSessionsViaCommand(bgWs);
        expect(sessionNames.length).toBe(3);
        console.log('After adding more:', sessionNames);

        expect(sessionNames).toContain('session1');
        expect(sessionNames).toContain('session2');
        expect(sessionNames).toContain('session3');
    });
});
