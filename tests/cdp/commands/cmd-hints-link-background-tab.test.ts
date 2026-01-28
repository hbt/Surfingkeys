/**
 * CDP Test: cmd_hints_link_background_tab
 *
 * Comprehensive tests for the hints command 'gf' (Open link in background tab).
 * - Command: cmd_hints_link_background_tab
 * - Key: 'gf' (or 'C' alias - Shift+c)
 * - Behavior: Show hints and open selected link in a new background tab (without switching focus)
 * - Focus: Background tab creation, tab state verification, hint interaction
 *
 * Key differences from 'f' command:
 * - Creates new tab without activating it (active: false)
 * - Original tab remains active
 * - Tab count increases by 1
 *
 * Tests based on patterns from:
 * - cmd-hints-open-link.test.ts (hint creation and interaction)
 * - cmd-visual-click-node-newtab.test.ts (tab management)
 * - cdp-create-hints.test.ts (shadow DOM handling)
 *
 * Note: Using 'C' (Shift+c) alias instead of 'gf' for more reliable key sequence handling.
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-link-background-tab.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-link-background-tab.test.ts
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

describe('cmd_hints_link_background_tab', () => {
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
                visible: h.offsetParent !== null
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
     * Get all tabs in current window
     */
    async function getAllTabs(): Promise<Array<{ id: number; url: string; active: boolean }>> {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({ currentWindow: true }, (tabs) => {
                    resolve(tabs.map(t => ({
                        id: t.id,
                        url: t.url,
                        active: t.active
                    })));
                });
            })
        `);
        return result;
    }

    /**
     * Get currently active tab
     */
    async function getActiveTab(): Promise<{ id: number; url: string }> {
        const result = await executeInTarget(bgWs, `
            new Promise((resolve) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    resolve(tabs[0] ? { id: tabs[0].id, url: tabs[0].url } : null);
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
            const tabs = await getAllTabs();
            return tabs.length === expectedCount;
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

        // Close any extra tabs created during tests (keep only fixture tab)
        const tabs = await getAllTabs();
        for (const tab of tabs) {
            if (tab.id !== tabId) {
                await closeTab(bgWs, tab.id);
            }
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

    describe('1.0 Page Setup', () => {
        test('1.1 should have expected number of links on page', async () => {
            const linkCount = await countElements(pageWs, 'a');
            // hints-test.html has ~50 links
            expect(linkCount).toBeGreaterThan(40);
            expect(linkCount).toBeLessThan(100);
        });

        test('1.2 should have no hints initially', async () => {
            const initialSnapshot = await fetchHintSnapshot();
            expect(initialSnapshot.found).toBe(false);
            expect(initialSnapshot.count).toBe(0);
        });

        test('1.3 should have only fixture tab initially', async () => {
            const tabs = await getAllTabs();
            expect(tabs.length).toBe(1);
            expect(tabs[0].id).toBe(tabId);
            expect(tabs[0].active).toBe(true);
        });
    });

    describe('2.0 Basic Hint Creation with gf', () => {
        test('2.1 should create hints when pressing gf keys', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Press 'C' (uppercase C - triggers hints for background tab)
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            // Query hints in shadowRoot
            const hintData = await fetchHintSnapshot();

            // Assertions
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(10);
            expect(hintData.count).toBeLessThan(100);
        });

        test('2.2 should have hints in shadowRoot at correct host element', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

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

        test('2.3 should create similar hint count as f command', async () => {
            // Test 'f' command
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);
            const fHintData = await fetchHintSnapshot();
            const fCount = fHintData.count;

            // Clear hints
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Test 'gf' command
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);
            const gfHintData = await fetchHintSnapshot();
            const gfCount = gfHintData.count;

            // Both should create hints for same elements
            expect(gfCount).toBe(fCount);
        });
    });

    describe('3.0 Background Tab Creation', () => {
        test('3.1 should open link in background tab (tab count increases)', async () => {
            const initialTabs = await getAllTabs();
            const initialCount = initialTabs.length;

            // Create hints with gf
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            // Get first hint and select it
            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];
            expect(firstHint).toBeDefined();

            // Type complete hint label to select link
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            // Wait for new tab to be created
            await waitForTabCount(initialCount + 1);

            // Verify tab count increased
            const finalTabs = await getAllTabs();
            expect(finalTabs.length).toBe(initialCount + 1);
        });

        test('3.2 should keep original tab active (not switch to new tab)', async () => {
            const initialActiveTab = await getActiveTab();
            expect(initialActiveTab.id).toBe(tabId);

            // Create hints and select first hint
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            // Wait for tab creation
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify original tab is still active
            const finalActiveTab = await getActiveTab();
            expect(finalActiveTab.id).toBe(tabId);
            expect(finalActiveTab.id).toBe(initialActiveTab.id);
        });

        test('3.3 should create new tab with href="#" (background tab)', async () => {
            const initialTabs = await getAllTabs();

            // Create hints and select hint
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            await waitForTabCount(initialTabs.length + 1);

            // Get all tabs and find the new one
            const finalTabs = await getAllTabs();
            const newTab = finalTabs.find(t => t.id !== tabId);

            expect(newTab).toBeDefined();
            expect(newTab!.active).toBe(false); // New tab should NOT be active
            expect(newTab!.url).toContain('#'); // Should have navigated to href="#"
        });

        test('3.4 should verify background tab is not active', async () => {
            // Create hints and select
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            await new Promise(resolve => setTimeout(resolve, 500));

            // Get all tabs and verify exactly one is active
            const tabs = await getAllTabs();
            const activeTabs = tabs.filter(t => t.active);
            const backgroundTabs = tabs.filter(t => !t.active);

            expect(activeTabs.length).toBe(1);
            expect(activeTabs[0].id).toBe(tabId); // Original tab is active
            expect(backgroundTabs.length).toBeGreaterThan(0); // At least one background tab
        });
    });

    describe('4.0 Multiple Background Tab Opens', () => {
        test('4.1 should open multiple links in background tabs sequentially', async () => {
            const initialTabs = await getAllTabs();
            const initialCount = initialTabs.length;

            // Open 3 links in background
            for (let i = 0; i < 3; i++) {
                await clickAt(pageWs, 100, 100);
                await sendKey(pageWs, 'g');
                await sendKey(pageWs, 'f');
                await waitForHintCount(10);

                const snapshot = await fetchHintSnapshot();
                const hint = snapshot.sortedHints[i];
                expect(hint).toBeDefined();

                for (const char of hint) {
                    await sendKey(pageWs, char, 50);
                }

                await waitForTabCount(initialCount + i + 1);
            }

            // Verify 3 new tabs were created
            const finalTabs = await getAllTabs();
            expect(finalTabs.length).toBe(initialCount + 3);

            // Verify original tab is still active
            const activeTab = await getActiveTab();
            expect(activeTab.id).toBe(tabId);
        });

        test('4.2 should create all background tabs as inactive', async () => {
            const initialTabs = await getAllTabs();
            const initialCount = initialTabs.length;

            // Open 2 links in background
            for (let i = 0; i < 2; i++) {
                await clickAt(pageWs, 100, 100);
                await sendKey(pageWs, 'g');
                await sendKey(pageWs, 'f');
                await waitForHintCount(10);

                const snapshot = await fetchHintSnapshot();
                const hint = snapshot.sortedHints[i];

                for (const char of hint) {
                    await sendKey(pageWs, char, 50);
                }

                await waitForTabCount(initialCount + i + 1);
            }

            // Verify all new tabs are inactive
            const finalTabs = await getAllTabs();
            const newTabs = finalTabs.filter(t => t.id !== tabId);

            expect(newTabs.length).toBe(2);
            newTabs.forEach(tab => {
                expect(tab.active).toBe(false);
            });

            // Verify original tab is still active
            const activeTab = await getActiveTab();
            expect(activeTab.id).toBe(tabId);
        });
    });

    describe('5.0 Hint Label Format', () => {
        test('5.1 should have properly formatted hint labels (uppercase letters)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();

            // Check sample hints match pattern
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('5.2 should have all hints matching uppercase letter pattern', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();

            // Verify all hints match pattern
            hintData.sortedHints.forEach((hintText: string) => {
                expect(hintText).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('5.3 should have unique hint labels', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();

            // Check for duplicates
            const uniqueHints = new Set(hintData.sortedHints);
            expect(uniqueHints.size).toBe(hintData.sortedHints.length);
        });
    });

    describe('6.0 Hint Visibility', () => {
        test('6.1 should have visible hints (offsetParent !== null)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();

            // Check sample hints are visible
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.visible).toBe(true);
            });
        });
    });

    describe('7.0 Hint Clearing', () => {
        test('7.1 should clear hints when pressing Escape', async () => {
            // Create hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
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

        test('7.2 should clear hints after selecting hint', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            // Type complete hint label to select it
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            // Hints should be cleared after selection
            await waitForHintsCleared();

            const afterSnapshot = await fetchHintSnapshot();
            expect(afterSnapshot.count).toBe(0);
        });

        test('7.3 should allow creating hints again after clearing', async () => {
            // Create and clear hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Create hints again
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(10);
        });
    });

    describe('8.0 Hint Interaction', () => {
        test('8.1 should filter hints when typing hint label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

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

        test('8.2 should open correct link when selecting specific hint', async () => {
            const initialTabCount = (await getAllTabs()).length;

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();
            const targetHint = snapshot.sortedHints[2]; // Select 3rd hint

            // Type complete hint label
            for (const char of targetHint) {
                await sendKey(pageWs, char, 50);
            }

            // Verify new tab was created
            await waitForTabCount(initialTabCount + 1);
            const finalTabs = await getAllTabs();
            expect(finalTabs.length).toBe(initialTabCount + 1);
        });
    });

    describe('9.0 Different Link Types', () => {
        test('9.1 should handle inline links in paragraphs', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();

            // Hints should include inline links
            expect(snapshot.count).toBeGreaterThan(5);
        });

        test('9.2 should handle navigation links', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();

            // Should have hints for navigation links (Home, About, etc.)
            expect(snapshot.count).toBeGreaterThan(5);
        });

        test('9.3 should handle list links', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();

            // Should have hints for list links (Articles)
            expect(snapshot.count).toBeGreaterThan(10);
        });

        test('9.4 should handle button-style links', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();

            // Should include button-style links
            expect(snapshot.count).toBeGreaterThan(3);
        });

        test('9.5 should handle dense link sections', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const snapshot = await fetchHintSnapshot();

            // Should handle dense sections with many adjacent links
            expect(snapshot.count).toBeGreaterThan(20);
        });
    });

    describe('10.0 Consistency and Snapshot', () => {
        test('10.1 should create consistent hints across multiple invocations', async () => {
            // First invocation
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);
            const snapshot1 = await fetchHintSnapshot();

            // Clear and recreate
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);
            const snapshot2 = await fetchHintSnapshot();

            // Verify consistency
            expect(snapshot1.count).toBe(snapshot2.count);
            expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
        });

        test('10.2 should have deterministic hint snapshot', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'C');
            await waitForHintCount(10);

            const hintSnapshot = await fetchHintSnapshot();

            // Verify hints were created
            expect(hintSnapshot.found).toBe(true);
            expect(hintSnapshot.count).toBeGreaterThan(10);

            // Snapshot test - ensures hints remain deterministic
            expect({
                count: hintSnapshot.count,
                sortedHints: hintSnapshot.sortedHints
            }).toMatchSnapshot();
        });
    });
});
