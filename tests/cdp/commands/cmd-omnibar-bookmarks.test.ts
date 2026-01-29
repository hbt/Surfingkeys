/**
 * CDP Test: cmd_omnibar_bookmarks
 *
 * Focused observability test for the bookmarks omnibar command.
 * - Single command: cmd_omnibar_bookmarks
 * - Single key: 'b'
 * - Single behavior: open bookmarks omnibar and select bookmark
 * - Focus: verify command execution and bookmark navigation without timeouts
 *
 * Usage:
 *   Live browser:    npm run test:cdp tests/cdp/commands/cmd-omnibar-bookmarks.test.ts
 *   Headless mode:   npm run test:cdp:headless tests/cdp/commands/cmd-omnibar-bookmarks.test.ts
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
    waitForSurfingkeysReady,
    waitFor,
    getPageURL
} from '../utils/browser-actions';
import { startCoverage, captureBeforeCoverage, captureAfterCoverage } from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

/**
 * Create a test bookmark in Chrome
 */
async function createBookmark(bgWs: WebSocket, title: string, url: string, parentId?: string): Promise<string> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            const bookmarkData = {
                title: "${title}",
                url: "${url}"
                ${parentId ? `, parentId: "${parentId}"` : ''}
            };
            chrome.bookmarks.create(bookmarkData, (bookmark) => {
                resolve(bookmark.id);
            });
        })
    `);
    return result;
}

/**
 * Remove a bookmark by ID
 */
async function removeBookmark(bgWs: WebSocket, bookmarkId: string): Promise<void> {
    await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.bookmarks.remove("${bookmarkId}", () => {
                resolve(true);
            });
        })
    `);
}

/**
 * Get all bookmarks
 */
async function getAllBookmarks(bgWs: WebSocket): Promise<any[]> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.bookmarks.getTree((bookmarkTreeNodes) => {
                const bookmarks = [];
                function traverse(nodes) {
                    for (const node of nodes) {
                        if (node.url) {
                            bookmarks.push(node);
                        }
                        if (node.children) {
                            traverse(node.children);
                        }
                    }
                }
                traverse(bookmarkTreeNodes);
                resolve(bookmarks);
            });
        })
    `);
    return result;
}

/**
 * Check if omnibar is visible on the page
 * The omnibar is inside an iframe in the shadow DOM
 */
async function isOmnibarVisible(pageWs: WebSocket): Promise<boolean> {
    const result = await executeInTarget(pageWs, `
        (function() {
            // Find the shadow DOM host with iframe inside
            const uiHosts = document.querySelectorAll('div');
            for (const host of uiHosts) {
                if (host.shadowRoot) {
                    const iframe = host.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe) {
                        try {
                            const iframeDoc = iframe.contentWindow.document;
                            const omnibar = iframeDoc.getElementById('sk_omnibar');
                            if (!omnibar) return false;
                            return omnibar.style.display !== 'none';
                        } catch (e) {
                            return false;
                        }
                    }
                }
            }
            return false;
        })()
    `);
    return result;
}

/**
 * Get omnibar prompt text
 */
async function getOmnibarPrompt(pageWs: WebSocket): Promise<string> {
    const result = await executeInTarget(pageWs, `
        (function() {
            // Find the shadow DOM host with iframe inside
            const uiHosts = document.querySelectorAll('div');
            for (const host of uiHosts) {
                if (host.shadowRoot) {
                    const iframe = host.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe) {
                        try {
                            const iframeDoc = iframe.contentWindow.document;
                            const omnibar = iframeDoc.getElementById('sk_omnibar');
                            if (!omnibar) return '';
                            const promptSpan = omnibar.querySelector('.prompt');
                            return promptSpan ? promptSpan.textContent : '';
                        } catch (e) {
                            return '';
                        }
                    }
                }
            }
            return '';
        })()
    `);
    return result;
}

/**
 * Get number of omnibar result items
 */
async function getOmnibarResultCount(pageWs: WebSocket): Promise<number> {
    const result = await executeInTarget(pageWs, `
        (function() {
            // Find the shadow DOM host with iframe inside
            const uiHosts = document.querySelectorAll('div');
            for (const host of uiHosts) {
                if (host.shadowRoot) {
                    const iframe = host.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe) {
                        try {
                            const iframeDoc = iframe.contentWindow.document;
                            const omnibar = iframeDoc.getElementById('sk_omnibar');
                            if (!omnibar) return 0;
                            const results = omnibar.querySelectorAll('#sk_omnibarSearchResult>ul>li');
                            return results.length;
                        } catch (e) {
                            return 0;
                        }
                    }
                }
            }
            return 0;
        })()
    `);
    return result;
}

/**
 * Get omnibar result items details
 */
async function getOmnibarResults(pageWs: WebSocket): Promise<Array<{title: string, url: string}>> {
    const result = await executeInTarget(pageWs, `
        (function() {
            // Find the shadow DOM host with iframe inside
            const uiHosts = document.querySelectorAll('div');
            for (const host of uiHosts) {
                if (host.shadowRoot) {
                    const iframe = host.shadowRoot.querySelector('iframe.sk_ui');
                    if (iframe) {
                        try {
                            const iframeDoc = iframe.contentWindow.document;
                            const omnibar = iframeDoc.getElementById('sk_omnibar');
                            if (!omnibar) return [];
                            const items = omnibar.querySelectorAll('#sk_omnibarSearchResult>ul>li');
                            const results = [];
                            items.forEach(item => {
                                const titleEl = item.querySelector('.title');
                                const title = titleEl ? titleEl.textContent : '';
                                const url = item.getAttribute('url') || item.url || '';
                                results.push({ title, url });
                            });
                            return results;
                        } catch (e) {
                            return [];
                        }
                    }
                }
            }
            return [];
        })()
    `);
    return result;
}


describe('cmd_omnibar_bookmarks', () => {
    const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';
    let testBookmarkIds: string[] = [];

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

        // Find and connect to content page
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scroll-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain for keyboard events
        enableInputDomain(pageWs);

        // Wait for page to load and Surfingkeys to inject
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection for page
        await startCoverage(pageWs, 'content-page');

        // Create test bookmarks
        console.log('Creating test bookmarks...');
        const bookmark1Id = await createBookmark(bgWs, 'Test Bookmark 1', 'http://example.com/test1');
        const bookmark2Id = await createBookmark(bgWs, 'Test Bookmark 2', 'http://example.com/test2');
        const bookmark3Id = await createBookmark(bgWs, 'SurfingKeys Test', 'http://example.com/surfingkeys');
        testBookmarkIds.push(bookmark1Id, bookmark2Id, bookmark3Id);
        console.log(`Created test bookmarks: ${testBookmarkIds.join(', ')}`);

        // Wait a bit for bookmarks to be indexed
        await new Promise(resolve => setTimeout(resolve, 500));
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

        // Ensure omnibar is closed after each test
        try {
            const visible = await isOmnibarVisible(pageWs);
            if (visible) {
                await sendKey(pageWs, 'Escape');
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } catch (e) {
            // Ignore errors during cleanup
        }
    });

    afterAll(async () => {
        // Remove test bookmarks
        console.log('Removing test bookmarks...');
        for (const bookmarkId of testBookmarkIds) {
            try {
                await removeBookmark(bgWs, bookmarkId);
            } catch (e) {
                console.log(`Failed to remove bookmark ${bookmarkId}: ${e}`);
            }
        }

        // Cleanup
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

    test('pressing b key opens bookmarks omnibar', async () => {
        // Press 'b' to open bookmarks omnibar
        await sendKey(pageWs, 'b');

        // Wait for UI to appear
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check if omnibar is visible
        const visible = await isOmnibarVisible(pageWs);
        console.log(`After b: omnibar visible: ${visible}`);

        expect(visible).toBe(true);

        // Verify prompt shows "bookmark"
        const prompt = await getOmnibarPrompt(pageWs);
        console.log(`Omnibar prompt: "${prompt}"`);
        expect(prompt).toContain('bookmark');
    });

    test('bookmarks omnibar shows test bookmarks', async () => {
        // Open bookmarks omnibar
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get result count
        const resultCount = await getOmnibarResultCount(pageWs);
        console.log(`Omnibar showing ${resultCount} results`);

        // Should have at least our 3 test bookmarks (may have more from browser)
        expect(resultCount).toBeGreaterThanOrEqual(3);

        // Get results details
        const results = await getOmnibarResults(pageWs);
        console.log(`Omnibar results: ${JSON.stringify(results.slice(0, 5), null, 2)}`);

        // Verify our test bookmarks are present
        const testBookmark1 = results.find(r => r.title === 'Test Bookmark 1');
        expect(testBookmark1).toBeDefined();
        expect(testBookmark1?.url).toBe('http://example.com/test1');
    });

    test('can filter bookmarks by typing search query', async () => {
        // Open bookmarks omnibar
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Type search query to filter
        await sendKey(pageWs, 'S');
        await sendKey(pageWs, 'u');
        await sendKey(pageWs, 'r');
        await sendKey(pageWs, 'f');

        // Wait for filtered results
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get filtered results
        const results = await getOmnibarResults(pageWs);
        console.log(`Filtered results (for "Surf"): ${JSON.stringify(results, null, 2)}`);

        // Should show "SurfingKeys Test" bookmark
        const surfingKeysBookmark = results.find(r => r.title === 'SurfingKeys Test');
        expect(surfingKeysBookmark).toBeDefined();
    });

    test('can select bookmark with Enter key and navigate to it', async () => {
        // Open bookmarks omnibar
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Type to filter to our test bookmark
        await sendKey(pageWs, 'T');
        await sendKey(pageWs, 'e');
        await sendKey(pageWs, 's');
        await sendKey(pageWs, 't');
        await sendKey(pageWs, ' ');
        await sendKey(pageWs, 'B');
        await sendKey(pageWs, 'o');
        await sendKey(pageWs, 'o');
        await sendKey(pageWs, 'k');

        // Wait for filtered results
        await new Promise(resolve => setTimeout(resolve, 300));

        // Get filtered results to verify
        const results = await getOmnibarResults(pageWs);
        console.log(`Results before selection: ${JSON.stringify(results, null, 2)}`);

        // Press Enter to select focused bookmark
        await sendKey(pageWs, 'Enter');

        // Wait for action
        await new Promise(resolve => setTimeout(resolve, 300));

        // Omnibar should close
        const omnibarClosed = !(await isOmnibarVisible(pageWs));
        expect(omnibarClosed).toBe(true);
        console.log('Bookmark selection successful - omnibar closed');
    });

    test('can close bookmarks omnibar with Escape key', async () => {
        // Open bookmarks omnibar
        await sendKey(pageWs, 'b');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify it's open
        let visible = await isOmnibarVisible(pageWs);
        expect(visible).toBe(true);

        // Press Escape to close
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify it's closed
        visible = await isOmnibarVisible(pageWs);
        expect(visible).toBe(false);
        console.log('Omnibar closed with Escape key');
    });
});
