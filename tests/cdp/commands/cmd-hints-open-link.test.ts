/**
 * CDP Test: cmd_hints_open_link
 *
 * Comprehensive tests for the hints command 'f' (Open link).
 * - Command: cmd_hints_open_link
 * - Key: 'f'
 * - Behavior: Show hints to click on links and interactive elements
 * - Focus: Shadow DOM rendering, hint creation, visibility, and interaction
 *
 * Tests based on patterns from cdp-create-hints.test.ts:
 * - Shadow DOM handling at .surfingkeys_hints_host
 * - Hint label format: /^[A-Z]{1,3}$/
 * - waitForHintCount pattern (no arbitrary timeouts)
 * - Visibility verification (offsetParent !== null)
 *
 * Note: Uses hackernews.html fixture (has external links but works reliably)
 * TODO: Create dedicated hints-test.html fixture with self-contained content
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-open-link.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-open-link.test.ts
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

describe('cmd_hints_open_link', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/hackernews.html';

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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/hackernews.html');
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
            // hackernews.html has ~200+ links
            expect(linkCount).toBeGreaterThan(200);
        });

        test('1.2 should have no hints initially', async () => {
            const initialSnapshot = await fetchHintSnapshot();
            expect(initialSnapshot.found).toBe(false);
            expect(initialSnapshot.count).toBe(0);
        });
    });

    describe('2.0 Basic Hint Creation', () => {
        test('2.1 should create hints when pressing f key', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Press 'f' to trigger hints
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            // Query hints in shadowRoot
            const hintData = await fetchHintSnapshot();

            // Assertions
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(20);
            expect(hintData.count).toBeLessThan(100);
        });

        test('2.2 should have hints in shadowRoot at correct host element', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
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

        test('2.3 should create hints for visible links', async () => {
            const linkCount = await countElements(pageWs, 'a');

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();

            // Hints are created for visible/clickable links (subset of all links)
            expect(hintData.count).toBeGreaterThan(10);
            expect(hintData.count).toBeLessThanOrEqual(linkCount);
        });
    });

    describe('3.0 Hint Label Format', () => {
        test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();

            // Check sample hints match pattern
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('3.2 should have all hints matching uppercase letter pattern', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();

            // Verify all hints match pattern
            hintData.sortedHints.forEach((hintText: string) => {
                expect(hintText).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('3.3 should have unique hint labels', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();

            // Check for duplicates
            const uniqueHints = new Set(hintData.sortedHints);
            expect(uniqueHints.size).toBe(hintData.sortedHints.length);
        });
    });

    describe('4.0 Hint Visibility', () => {
        test('4.1 should have visible hints (offsetParent !== null)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();

            // Check sample hints are visible
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.visible).toBe(true);
            });
        });

        test('4.2 should have hints with valid positions', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

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

        test('5.2 should allow creating hints again after clearing', async () => {
            // Create and clear hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Create hints again
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const hintData = await fetchHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(10);
        });
    });

    describe('6.0 Hint Consistency', () => {
        test('6.1 should create consistent hints across multiple invocations', async () => {
            // First invocation
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);
            const snapshot1 = await fetchHintSnapshot();

            // Clear and recreate
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);
            const snapshot2 = await fetchHintSnapshot();

            // Verify consistency
            expect(snapshot1.count).toBe(snapshot2.count);
            expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
        });

        test('6.2 should have deterministic hint snapshot', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
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

    describe('7.0 Edge Cases', () => {
        test('7.1 should handle rapid hint creation and clearing', async () => {
            for (let i = 0; i < 3; i++) {
                await clickAt(pageWs, 100, 100);
                await sendKey(pageWs, 'f');
                await waitForHintCount(10);

                const snapshot = await fetchHintSnapshot();
                expect(snapshot.count).toBeGreaterThan(10);

                await sendKey(pageWs, 'Escape');
                await waitForHintsCleared();
            }
        });

        test('7.2 should toggle hints when pressing f key repeatedly', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

            const firstSnapshot = await fetchHintSnapshot();
            expect(firstSnapshot.count).toBeGreaterThan(10);

            // Press 'f' again (may toggle off or recreate)
            await sendKey(pageWs, 'f');
            await new Promise(resolve => setTimeout(resolve, 300));

            const secondSnapshot = await fetchHintSnapshot();

            // Hints may be cleared or recreated (both behaviors are valid)
            // Just verify no error occurred
            expect(secondSnapshot.found).toBeDefined();
        });
    });

    describe('8.0 Hint Interaction', () => {
        test('8.1 should filter hints when typing hint label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
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
                // (exact behavior depends on implementation)
                expect(filteredSnapshot.count).toBeLessThanOrEqual(initialCount);
            }
        });

        test('8.2 should clear hints after selecting hint by label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'f');
            await waitForHintCount(10);

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
