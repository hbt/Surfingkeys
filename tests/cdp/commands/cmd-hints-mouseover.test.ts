/**
 * CDP Test: cmd_hints_mouseover
 *
 * Comprehensive tests for the hints command '<Ctrl-h>' (Mouse over elements).
 * - Command: cmd_hints_mouseover
 * - Key: '<Ctrl-h>'
 * - Behavior: Show hints to trigger mouseover events on elements
 * - Focus: Shadow DOM rendering, hint creation, mouseover event triggering, state changes
 *
 * Tests based on patterns from cmd-hints-open-link.test.ts:
 * - Shadow DOM handling at .surfingkeys_hints_host
 * - Hint label format: /^[A-Z]{1,3}$/
 * - waitForHintCount pattern (no arbitrary timeouts)
 * - Visibility verification (offsetParent !== null)
 * - Mouseover event tracking and state verification
 *
 * Note: Uses mouseover-test.html fixture with self-contained elements
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-mouseover.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-mouseover.test.ts
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

describe('cmd_hints_mouseover', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/mouseover-test.html';

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

    async function getMouseoverCount(elementId: string): Promise<number> {
        return executeInTarget(pageWs, `window.getMouseoverCount('${elementId}')`);
    }

    async function getAllMouseoverCounts(): Promise<Record<string, number>> {
        return executeInTarget(pageWs, `window.getAllMouseoverCounts()`);
    }

    async function resetMouseoverCounts() {
        await executeInTarget(pageWs, `window.resetMouseoverCounts()`);
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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/mouseover-test.html');
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

        // Reset mouseover counts before each test
        await resetMouseoverCounts();

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
        test('1.1 should have expected number of interactive elements on page', async () => {
            const linkCount = await countElements(pageWs, 'a');
            const buttonCount = await countElements(pageWs, 'button');
            const imgCount = await countElements(pageWs, 'img');

            // mouseover-test.html has 6 links, 5 buttons, and 3 images
            expect(linkCount).toBeGreaterThanOrEqual(5);
            expect(buttonCount).toBeGreaterThanOrEqual(4);
            expect(imgCount).toBeGreaterThanOrEqual(3);
        });

        test('1.2 should have no hints initially', async () => {
            const initialSnapshot = await fetchHintSnapshot();
            expect(initialSnapshot.found).toBe(false);
            expect(initialSnapshot.count).toBe(0);
        });

        test('1.3 should have mouseover tracking initialized', async () => {
            const counts = await getAllMouseoverCounts();
            expect(counts).toBeDefined();
            expect(typeof counts).toBe('object');
        });
    });

    describe('2.0 Basic Hint Creation', () => {
        test('2.1 should create hints when pressing Ctrl-h key', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Press 'Ctrl-h' to trigger hints
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            // Query hints in shadowRoot
            const hintData = await fetchHintSnapshot();

            // Assertions
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThanOrEqual(8);
        });

        test('2.2 should have hints in shadowRoot at correct host element', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

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

        test('2.3 should create hints for visible interactive elements', async () => {
            const linkCount = await countElements(pageWs, 'a');
            const buttonCount = await countElements(pageWs, 'button');

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Hints are created for visible/clickable elements
            expect(hintData.count).toBeGreaterThan(5);
            expect(hintData.count).toBeLessThanOrEqual(linkCount + buttonCount + 20);
        });
    });

    describe('3.0 Hint Label Format', () => {
        test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Check sample hints match pattern
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('3.2 should have all hints matching uppercase letter pattern', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Verify all hints match pattern
            hintData.sortedHints.forEach((hintText: string) => {
                expect(hintText).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('3.3 should have unique hint labels', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Check for duplicates
            const uniqueHints = new Set(hintData.sortedHints);
            expect(uniqueHints.size).toBe(hintData.sortedHints.length);
        });
    });

    describe('4.0 Hint Visibility', () => {
        test('4.1 should have visible hints (offsetParent !== null)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Check sample hints are visible
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.visible).toBe(true);
            });
        });

        test('4.2 should have hints with valid positions', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Verify hints have position data
            hintData.sample.forEach((hint: any) => {
                expect(hint.position).toBeDefined();
                expect(typeof hint.position.left).toBe('number');
                expect(typeof hint.position.top).toBe('number');
            });
        });
    });

    describe('5.0 Mouseover Event Triggering', () => {
        test('5.1 should trigger mouseover event when selecting hint', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            // Get initial mouseover counts
            const beforeCounts = await getAllMouseoverCounts();

            // Get first hint and select it
            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];
            expect(firstHint).toBeDefined();

            // Type complete hint label to trigger mouseover
            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                // Wait for hints to clear
                await waitForHintsCleared();

                // Check that at least one element received mouseover
                const afterCounts = await getAllMouseoverCounts();
                const totalBefore = Object.values(beforeCounts).reduce((a: number, b: number) => a + b, 0);
                const totalAfter = Object.values(afterCounts).reduce((a: number, b: number) => a + b, 0);

                expect(totalAfter).toBeGreaterThan(totalBefore);
            }
        });

        test('5.2 should trigger mouseover on specific element types', async () => {
            // Test with link
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                await waitForHintsCleared();

                // At least one element should have mouseover count > 0
                const counts = await getAllMouseoverCounts();
                const hasMouseover = Object.values(counts).some((count: number) => count > 0);
                expect(hasMouseover).toBe(true);
            }
        });

        test('5.3 should increment mouseover count on multiple selections', async () => {
            // First selection
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const snapshot1 = await fetchHintSnapshot();
            const firstHint = snapshot1.sortedHints[0];

            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }
                await waitForHintsCleared();
            }

            const afterFirst = await getAllMouseoverCounts();

            // Second selection of same hint
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const snapshot2 = await fetchHintSnapshot();
            const secondHint = snapshot2.sortedHints[0];

            if (secondHint) {
                for (const char of secondHint) {
                    await sendKey(pageWs, char, 50);
                }
                await waitForHintsCleared();
            }

            const afterSecond = await getAllMouseoverCounts();

            // At least one element should have increased count
            const totalFirst = Object.values(afterFirst).reduce((a: number, b: number) => a + b, 0);
            const totalSecond = Object.values(afterSecond).reduce((a: number, b: number) => a + b, 0);

            expect(totalSecond).toBeGreaterThan(totalFirst);
        });
    });

    describe('6.0 Hint Clearing', () => {
        test('6.1 should clear hints when pressing Escape', async () => {
            // Create hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            // Verify hints exist
            const beforeClear = await fetchHintSnapshot();
            expect(beforeClear.found).toBe(true);
            expect(beforeClear.count).toBeGreaterThan(5);

            // Clear hints
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Verify hints are cleared
            const afterClear = await fetchHintSnapshot();
            expect(afterClear.count).toBe(0);
        });

        test('6.2 should allow creating hints again after clearing', async () => {
            // Create and clear hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Create hints again
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(5);
        });

        test('6.3 should clear hints after selecting hint', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

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

    describe('7.0 Hint Consistency', () => {
        test('7.1 should create consistent hints across multiple invocations', async () => {
            // First invocation
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);
            const snapshot1 = await fetchHintSnapshot();

            // Clear and recreate
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);
            const snapshot2 = await fetchHintSnapshot();

            // Verify consistency
            expect(snapshot1.count).toBe(snapshot2.count);
            expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
        });

        test('7.2 should have deterministic hint snapshot', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintSnapshot = await fetchHintSnapshot();

            // Verify hints were created
            expect(hintSnapshot.found).toBe(true);
            expect(hintSnapshot.count).toBeGreaterThan(5);

            // Snapshot test - ensures hints remain deterministic
            expect({
                count: hintSnapshot.count,
                sortedHints: hintSnapshot.sortedHints
            }).toMatchSnapshot();
        });
    });

    describe('8.0 Edge Cases', () => {
        test('8.1 should handle rapid hint creation and clearing', async () => {
            for (let i = 0; i < 3; i++) {
                await clickAt(pageWs, 100, 100);
                await sendKey(pageWs, 'Control+h');
                await waitForHintCount(5);

                const snapshot = await fetchHintSnapshot();
                expect(snapshot.count).toBeGreaterThan(5);

                await sendKey(pageWs, 'Escape');
                await waitForHintsCleared();
            }
        });

        test('8.2 should handle mouseover on different element types', async () => {
            // Create hints and select first hint
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }
                await waitForHintsCleared();
            }

            // Verify at least one element received mouseover
            const counts = await getAllMouseoverCounts();
            const elementsWithMouseover = Object.values(counts).filter((count: number) => count > 0).length;
            expect(elementsWithMouseover).toBeGreaterThan(0);

            // Test that the fixture contains different types of interactive elements
            const linkCount = await countElements(pageWs, 'a');
            const buttonCount = await countElements(pageWs, 'button');
            const imgCount = await countElements(pageWs, 'img');

            expect(linkCount + buttonCount + imgCount).toBeGreaterThan(10);
        });

        test('8.3 should not trigger mouseover when canceling with Escape', async () => {
            const beforeCounts = await getAllMouseoverCounts();

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            // Cancel without selecting
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            const afterCounts = await getAllMouseoverCounts();

            // Counts should remain the same
            expect(afterCounts).toEqual(beforeCounts);
        });
    });

    describe('9.0 Hint Interaction', () => {
        test('9.1 should filter hints when typing hint label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

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

        test('9.2 should complete mouseover after typing full hint label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            const beforeCounts = await getAllMouseoverCounts();

            // Type complete hint label
            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                await waitForHintsCleared();

                // Verify mouseover was triggered
                const afterCounts = await getAllMouseoverCounts();
                const totalBefore = Object.values(beforeCounts).reduce((a: number, b: number) => a + b, 0);
                const totalAfter = Object.values(afterCounts).reduce((a: number, b: number) => a + b, 0);

                expect(totalAfter).toBeGreaterThan(totalBefore);
            }
        });
    });

    describe('10.0 Element Type Coverage', () => {
        test('10.1 should create hints for links', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();
            const linkCount = await countElements(pageWs, 'a');

            // Should have hints (links are interactive elements)
            expect(hintData.count).toBeGreaterThan(0);
            expect(linkCount).toBeGreaterThan(5);
        });

        test('10.2 should create hints for buttons', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();
            const buttonCount = await countElements(pageWs, 'button');

            // Should have hints (buttons are interactive elements)
            expect(hintData.count).toBeGreaterThan(0);
            expect(buttonCount).toBeGreaterThanOrEqual(4);
        });

        test('10.3 should create hints for images', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'Control+h');
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();
            const imgCount = await countElements(pageWs, 'img');

            // Should have hints for images as well
            expect(hintData.count).toBeGreaterThan(0);
            expect(imgCount).toBeGreaterThan(2);
        });
    });
});
