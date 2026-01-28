/**
 * CDP Test: cmd_hints_multiple_links
 *
 * Comprehensive tests for the hints command 'cf' (Open multiple links).
 * - Command: cmd_hints_multiple_links
 * - Key: 'cf'
 * - Behavior: Show hints to open multiple links in new tabs with multipleHits mode
 * - Focus: Multiple selection mode where hints remain after selection
 *
 * Key differences from single-link commands:
 * - multipleHits: true - hints stay visible after selection
 * - Multiple hints can be selected before exiting
 * - All selected links open in new tabs
 * - Hints refresh after each selection
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-multiple-links.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-multiple-links.test.ts
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

describe('cmd_hints_multiple_links', () => {
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
        await waitFor(async () => {
            const snapshot = await fetchHintSnapshot();
            return snapshot.found && snapshot.count >= minCount;
        }, 6000, 100);
    }

    async function waitForHintsCleared() {
        await waitFor(async () => {
            const snapshot = await fetchHintSnapshot();
            return !snapshot.found || snapshot.count === 0;
        }, 4000, 100);
    }

    /**
     * Get current tab count
     */
    async function getTabCount(): Promise<number> {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({}, (tabs) => {
                    resolve(tabs.length);
                });
            })
        `);
        return result;
    }

    /**
     * Wait for tab count to reach expected value
     */
    async function waitForTabCount(expectedCount: number) {
        await waitFor(async () => {
            const count = await getTabCount();
            return count >= expectedCount;
        }, 5000, 100);
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

        // Close any extra tabs opened during test (keep original tab)
        const currentTabCount = await getTabCount();
        if (currentTabCount > 1) {
            await executeInTarget(bgWs, `
                new Promise((resolve) => {
                    chrome.tabs.query({}, (tabs) => {
                        // Close all tabs except the first one (fixture tab)
                        let closeCount = 0;
                        for (let i = 1; i < tabs.length; i++) {
                            chrome.tabs.remove(tabs[i].id, () => {
                                closeCount++;
                                if (closeCount === tabs.length - 1) {
                                    resolve(true);
                                }
                            });
                        }
                        if (tabs.length <= 1) {
                            resolve(true);
                        }
                    });
                })
            `);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Capture coverage snapshot after test and calculate delta
        await captureAfterCoverage(pageWs, currentTestName, beforeCovData);
    });

    afterAll(async () => {
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

    describe('1.0 Basic Hint Creation', () => {
        test('1.1 should create hints when pressing cf keys', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Press 'cf' to trigger multiple hints mode
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            // Query hints in shadowRoot
            const hintData = await fetchHintSnapshot();

            // Assertions
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(20);
        });
    });

    describe('2.0 Multiple Selection Mode', () => {
        test('2.1 should keep hints visible after selecting first hint', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const beforeSelection = await fetchHintSnapshot();
            expect(beforeSelection.count).toBeGreaterThan(10);

            // Select first hint by typing its label
            const firstHint = beforeSelection.sortedHints[0];
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            // Wait for hints to reset (multipleHits mode)
            await new Promise(resolve => setTimeout(resolve, 400));

            // Verify hints are still visible
            const afterSelection = await fetchHintSnapshot();
            expect(afterSelection.found).toBe(true);
            expect(afterSelection.count).toBeGreaterThan(10);
        });

        test('2.2 should allow selecting multiple hints sequentially', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();
            const hintsToSelect = snapshot.sortedHints.slice(0, 2);

            // Select 2 hints
            for (const hint of hintsToSelect) {
                for (const char of hint) {
                    await sendKey(pageWs, char, 50);
                }
                await new Promise(resolve => setTimeout(resolve, 400));
            }

            // Verify hints are still active after multiple selections
            const finalSnapshot = await fetchHintSnapshot();
            expect(finalSnapshot.count).toBeGreaterThan(10);
        });
    });

    describe('3.0 Tab Creation', () => {
        test('3.1 should open selected link in new tab', async () => {
            const initialTabCount = await getTabCount();

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            // Select first hint
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            // Wait for tab creation
            await waitForTabCount(initialTabCount + 1);

            const finalTabCount = await getTabCount();
            expect(finalTabCount).toBe(initialTabCount + 1);
        });

        test('3.2 should open multiple selected links in separate tabs', async () => {
            const initialTabCount = await getTabCount();

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();
            const hintsToSelect = snapshot.sortedHints.slice(0, 3);

            // Select 3 hints
            for (const hint of hintsToSelect) {
                for (const char of hint) {
                    await sendKey(pageWs, char, 50);
                }
                await new Promise(resolve => setTimeout(resolve, 400));
            }

            // Wait for all tabs to be created
            await waitForTabCount(initialTabCount + 3);

            const finalTabCount = await getTabCount();
            expect(finalTabCount).toBe(initialTabCount + 3);
        });
    });

    describe('4.0 Hint Clearing', () => {
        test('4.1 should clear hints when pressing Escape', async () => {
            // Create hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            // Verify hints exist
            const beforeClear = await fetchHintSnapshot();
            expect(beforeClear.found).toBe(true);
            expect(beforeClear.count).toBeGreaterThan(10);

            // Clear hints
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Verify hints are cleared
            const afterClear = await fetchHintSnapshot();
            expect(afterClear.count).toBe(0);
        });
    });
});
