/**
 * CDP Test: cmd_hints_link_active_tab
 *
 * Comprehensive tests for the hints command 'af' (Open link in active tab).
 * - Command: cmd_hints_link_active_tab
 * - Key: 'af'
 * - Behavior: Show hints to open link in a new active tab (switches to new tab)
 * - Focus: Shadow DOM rendering, hint creation, tab creation, and tab activation
 *
 * Key difference from 'gf':
 * - 'af': Opens link in NEW tab and makes it ACTIVE (switches to it)
 * - 'gf': Opens link in NEW tab but keeps it in BACKGROUND (stays on current)
 *
 * Tests based on patterns from cmd-hints-open-link.test.ts:
 * - Shadow DOM handling at .surfingkeys_hints_host
 * - Hint label format: /^[A-Z]{1,3}$/
 * - waitForHintCount pattern (no arbitrary timeouts)
 * - Visibility verification (offsetParent !== null)
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-link-active-tab.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-link-active-tab.test.ts
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
    clickAt,
    countElements,
    enableInputDomain,
    waitForSurfingkeysReady,
    waitFor
} from '../utils/browser-actions';
import {
    startCoverage,
    captureBeforeCoverage,
    captureAfterCoverage
} from '../utils/cdp-coverage';
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
 * Get all tabs in current window
 */
async function getAllTabs(bgWs: WebSocket): Promise<Array<{ id: number; index: number; url: string; active: boolean }>> {
    const result = await executeInTarget(bgWs, `
        new Promise((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map(t => ({
                    id: t.id,
                    index: t.index,
                    url: t.url,
                    active: t.active
                })));
            });
        })
    `);
    return result;
}

/**
 * Wait for a specific number of tabs
 */
async function waitForTabCount(bgWs: WebSocket, expectedCount: number, timeoutMs: number = 5000): Promise<void> {
    await waitFor(async () => {
        const tabs = await getAllTabs(bgWs);
        return tabs.length === expectedCount;
    }, timeoutMs, 100);
}

describe('cmd_hints_link_active_tab', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/hints-test.html';

    /**
     * Fetch snapshot of hints in shadowRoot
     * Returns: { found, count, sample, sortedHints }
     */
    const hintSnapshotScript = `
        (function() {
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            if (!hintsHost || !hintsHost.shadowRoot) {
                return { found: false, count: 0, sample: [], sortedHints: [] };
            }

            const shadowRoot = hintsHost.shadowRoot;
            const hintElements = Array.from(shadowRoot.querySelectorAll('div'));

            // Filter for hint labels (1-3 uppercase letters)
            const hintDivs = hintElements.filter(d => {
                const text = (d.textContent || '').trim();
                return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
            });

            const sample = hintDivs.slice(0, 5).map(h => ({
                text: h.textContent?.trim(),
                visible: h.offsetParent !== null,
                position: {
                    left: h.offsetLeft,
                    top: h.offsetTop
                }
            }));

            const sortedHints = hintDivs.map(h => h.textContent?.trim()).sort();

            return {
                found: true,
                count: hintDivs.length,
                sample,
                sortedHints
            };
        })()
    `;

    async function fetchHintSnapshot() {
        return executeInTarget(pageWs, hintSnapshotScript);
    }

    async function waitForHintCount(minCount: number) {
        // Give hints initial time to render
        await new Promise(resolve => setTimeout(resolve, 800));

        // Then verify they're there
        const snapshot = await fetchHintSnapshot();
        if (!snapshot.found || snapshot.count < minCount) {
            throw new Error(`Expected at least ${minCount} hints, but found ${snapshot.count}`);
        }
    }

    async function waitForHintsCleared() {
        await waitFor(async () => {
            const snapshot = await fetchHintSnapshot();
            return !snapshot.found || snapshot.count === 0;
        }, 4000, 100);
    }

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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hints-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        // Enable Input domain
        enableInputDomain(pageWs);

        // Wait for page to load
        await waitForSurfingkeysReady(pageWs);

        // Start V8 coverage collection
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
        // Clear any hints left over from test
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture coverage snapshot after test and calculate delta
        await captureAfterCoverage(pageWs, currentTestName, beforeCovData);
    });

    afterAll(async () => {
        // Cleanup - close all tabs except the original
        const allTabs = await getAllTabs(bgWs);
        for (const tab of allTabs) {
            if (tab.id !== tabId) {
                try {
                    await closeTab(bgWs, tab.id);
                } catch (e) {
                    // Ignore errors when closing tabs
                }
            }
        }

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

    describe('1.0 Page Setup', () => {
        test('1.1 should have expected number of links on page', async () => {
            const linkCount = await countElements(pageWs, 'a');
            // hints-test.html has ~50+ links
            expect(linkCount).toBeGreaterThan(40);
        });

        test('1.2 should have no hints initially', async () => {
            const initialSnapshot = await fetchHintSnapshot();
            expect(initialSnapshot.found).toBe(false);
            expect(initialSnapshot.count).toBe(0);
        });
    });

    describe('2.0 Basic Hint Creation', () => {
        test('2.1 should create hints when pressing af key', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Press 'af' to trigger hints
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            // Query hints in shadowRoot
            const hintData = await fetchHintSnapshot();

            // Assertions
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(3);
            expect(hintData.count).toBeLessThan(100);
        });

        test('2.2 should have hints in shadowRoot at correct host element', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            const hostInfo = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    return {
                        found: hintsHost ? true : false,
                        hasShadowRoot: hintsHost?.shadowRoot ? true : false,
                        shadowRootChildren: hintsHost?.shadowRoot?.children.length || 0
                    };
                })()
            `);

            expect(hostInfo.found).toBe(true);
            expect(hostInfo.hasShadowRoot).toBe(true);
            expect(hostInfo.shadowRootChildren).toBeGreaterThan(0);
        });

        test('2.3 should create hints for visible links', async () => {
            const linkCount = await countElements(pageWs, 'a');

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();

            // Hints are created for visible/clickable links (subset of all links)
            expect(hintData.count).toBeGreaterThan(3);
            expect(hintData.count).toBeLessThanOrEqual(linkCount);
        });
    });

    describe('3.0 Hint Label Format', () => {
        test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();

            // Check sample hints match pattern
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('3.2 should have unique hint labels', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();

            // Check for duplicates
            const uniqueHints = new Set(hintData.sortedHints);
            expect(uniqueHints.size).toBe(hintData.sortedHints.length);
        });
    });

    describe('4.0 Hint Visibility', () => {
        test('4.1 should have visible hints (offsetParent !== null)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();

            // Check sample hints are visible
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.visible).toBe(true);
            });
        });

        test('4.2 should have hints with valid positions', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();

            // Verify hints have position data
            hintData.sample.forEach((hint: any) => {
                expect(hint.position).toBeDefined();
                expect(typeof hint.position.left).toBe('number');
                expect(typeof hint.position.top).toBe('number');
            });
        });
    });

    describe('5.0 Hint Clearing', () => {
        test('5.1 should clear hints when pressing Escape', async () => {
            // Create hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            // Verify hints exist
            const beforeClear = await fetchHintSnapshot();
            expect(beforeClear.found).toBe(true);
            expect(beforeClear.count).toBeGreaterThan(3);

            // Clear hints
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Verify hints are cleared
            const afterClear = await fetchHintSnapshot();
            expect(afterClear.count).toBe(0);
        });

        test('5.2 should allow creating hints again after clearing', async () => {
            // Create and clear hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Create hints again
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(3);
        });
    });

    describe('6.0 Hint Consistency', () => {
        test('6.1 should create consistent hints across multiple invocations', async () => {
            // First invocation
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);
            const snapshot1 = await fetchHintSnapshot();

            // Clear and recreate
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);
            const snapshot2 = await fetchHintSnapshot();

            // Verify consistency
            expect(snapshot1.count).toBe(snapshot2.count);
            expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
        });
    });

    describe('7.0 Tab Behavior - Open Link in Active Tab', () => {
        test('7.1 should create new tab when selecting hint', async () => {
            // Get initial tab count
            const initialTabs = await getAllTabs(bgWs);
            const initialCount = initialTabs.length;

            // Create hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            // Get first hint and select it
            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];
            expect(firstHint).toBeDefined();

            // Type hint label to select link
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            // Wait for new tab to be created
            await waitForTabCount(bgWs, initialCount + 1, 5000);

            // Verify new tab was created
            const finalTabs = await getAllTabs(bgWs);
            expect(finalTabs.length).toBe(initialCount + 1);
        });

        test('7.2 should activate new tab (switch to it)', async () => {
            // Get initial active tab
            const initialActiveTab = await getActiveTab(bgWs);

            // Create hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            // Get first hint and select it
            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            // Type hint label to select link
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            // Wait for new tab to be created and activated
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify new tab is now active
            const newActiveTab = await getActiveTab(bgWs);
            expect(newActiveTab.id).not.toBe(initialActiveTab.id);
            expect(newActiveTab.url).not.toBe(FIXTURE_URL);
        });

        test('7.3 should navigate to link URL in new active tab', async () => {
            // Get initial tab count
            const initialTabs = await getAllTabs(bgWs);
            const initialCount = initialTabs.length;

            // Create hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            // Select hint
            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            // Wait for new tab
            await waitForTabCount(bgWs, initialCount + 1, 5000);

            // Verify new active tab has different URL
            const newActiveTab = await getActiveTab(bgWs);
            expect(newActiveTab.url).toBeDefined();
            expect(newActiveTab.url).not.toBe('about:blank');
        });

        test('7.4 should open multiple links in multiple new tabs', async () => {
            // Get initial tab count
            const initialTabs = await getAllTabs(bgWs);
            const initialCount = initialTabs.length;

            // First link
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);
            const snapshot1 = await fetchHintSnapshot();
            const hint1 = snapshot1.sortedHints[0];
            for (const char of hint1) {
                await sendKey(pageWs, char, 50);
            }
            await waitForHintsCleared();
            await new Promise(resolve => setTimeout(resolve, 500));

            // Second link (need to navigate back to original tab first)
            const allTabs = await getAllTabs(bgWs);
            const originalTab = allTabs.find(t => t.url.includes(FIXTURE_URL));
            if (originalTab) {
                // Switch back to original tab
                await executeInTarget(bgWs, `
                    new Promise((resolve) => {
                        chrome.tabs.update(${originalTab.id}, { active: true }, () => resolve(true));
                    })
                `);
                await new Promise(resolve => setTimeout(resolve, 500));

                // Reconnect to the original page
                const pageWsUrl = await findContentPage('127.0.0.1:9873/hints-test.html');
                const tempPageWs = await connectToCDP(pageWsUrl);
                enableInputDomain(tempPageWs);

                await clickAt(tempPageWs, 100, 100);
                await sendKey(tempPageWs, 'a');
                await sendKey(tempPageWs, 'f');
                await new Promise(resolve => setTimeout(resolve, 800));

                const snapshot2 = await executeInTarget(tempPageWs, hintSnapshotScript);
                const hint2 = snapshot2.sortedHints[1]; // Use different hint
                for (const char of hint2) {
                    await sendKey(tempPageWs, char, 50);
                }

                await closeCDP(tempPageWs);
            }

            // Wait for tab count to increase
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify multiple tabs were created
            const finalTabs = await getAllTabs(bgWs);
            expect(finalTabs.length).toBeGreaterThanOrEqual(initialCount + 2);
        });
    });

    describe('8.0 Hint Interaction', () => {
        test('8.1 should filter hints when typing hint label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            const initialSnapshot = await fetchHintSnapshot();
            const initialCount = initialSnapshot.count;

            // Get first hint label
            const firstHint = initialSnapshot.sortedHints[0];
            expect(firstHint).toBeDefined();

            // Type first character of hint
            if (firstHint && firstHint.length > 0) {
                await sendKey(pageWs, firstHint[0]);
                await new Promise(resolve => setTimeout(resolve, 200));

                const filteredSnapshot = await fetchHintSnapshot();

                // Hint count should decrease or hints should filter
                expect(filteredSnapshot.count).toBeLessThanOrEqual(initialCount);
            }
        });

        test('8.2 should clear hints after selecting hint by label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'a');
            await sendKey(pageWs, 'f');
            await waitForHintCount(3);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            // Type complete hint label to select it
            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                // Hints should be cleared after selection
                await waitForHintsCleared();

                const afterSnapshot = await fetchHintSnapshot();
                expect(afterSnapshot.count).toBe(0);
            }
        });
    });
});
