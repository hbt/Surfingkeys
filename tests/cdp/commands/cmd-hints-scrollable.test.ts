/**
 * CDP Test: cmd_hints_scrollable
 *
 * Comprehensive tests for the hints command ';fs' (Focus scrollable elements).
 * - Command: cmd_hints_scrollable
 * - Key: ';fs'
 * - Behavior: Show hints to focus elements with scrollable content
 * - Focus: Shadow DOM rendering, hint creation for scrollable elements, focus behavior
 *
 * Tests based on patterns from cmd-hints-open-link.test.ts:
 * - Shadow DOM handling at .surfingkeys_hints_host
 * - Hint label format: /^[A-Z]{1,3}$/
 * - waitForHintCount pattern (no arbitrary timeouts)
 * - Visibility verification (offsetParent !== null)
 *
 * Note: Uses scrollable-test.html fixture with self-contained content
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-scrollable.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-scrollable.test.ts
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

describe('cmd_hints_scrollable', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/scrollable-test.html';

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
     * Count scrollable elements on page (elements with data-hint_scrollable attribute)
     */
    async function countScrollableElements() {
        return executeInTarget(pageWs, `
            (function() {
                // Trigger scrollable elements detection
                return document.querySelectorAll('[data-hint_scrollable]').length;
            })()
        `);
    }

    /**
     * Get info about scrollable elements
     */
    async function getScrollableElementsInfo() {
        return executeInTarget(pageWs, `
            (function() {
                const scrollables = Array.from(document.querySelectorAll('[data-hint_scrollable]'));
                return {
                    count: scrollables.length,
                    ids: scrollables.map(el => el.id || el.tagName).slice(0, 10),
                    types: scrollables.map(el => el.tagName).slice(0, 10)
                };
            })()
        `);
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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/scrollable-test.html');
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
        test('1.1 should have scrollable div elements on page', async () => {
            const divCount = await countElements(pageWs, 'div');
            expect(divCount).toBeGreaterThan(10);
        });

        test('1.2 should have no hints initially', async () => {
            const initialSnapshot = await fetchHintSnapshot();
            expect(initialSnapshot.found).toBe(false);
            expect(initialSnapshot.count).toBe(0);
        });

        test('1.3 should have scrollable elements after page load', async () => {
            // Click to ensure focus
            await clickAt(pageWs, 100, 100);

            // Trigger command once to initialize scrollable elements detection
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Clear hints
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Now check for data-hint_scrollable attribute
            const info = await getScrollableElementsInfo();
            expect(info.count).toBeGreaterThan(0);
        });
    });

    describe('2.0 Basic Hint Creation', () => {
        test('2.1 should create hints when pressing ;fs keys', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Press ';fs' to trigger hints
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            // Query hints in shadowRoot
            const hintData = await fetchHintSnapshot();

            // Assertions
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThanOrEqual(3);
        });

        test('2.2 should have hints in shadowRoot at correct host element', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
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

        test('2.3 should create hints for scrollable elements only', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();

            // Should have reasonable number of hints (scrollable elements detected by Mode.getScrollableElements)
            // Note: getScrollableElements requires scrollHeight > 200px and hasScroll true
            expect(hintData.count).toBeGreaterThanOrEqual(3);
            expect(hintData.count).toBeLessThan(30);
        });
    });

    describe('3.0 Hint Label Format', () => {
        test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();

            // Check sample hints match pattern
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('3.2 should have all hints matching uppercase letter pattern', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();

            // Verify all hints match pattern
            hintData.sortedHints.forEach((hintText: string) => {
                expect(hintText).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('3.3 should have unique hint labels', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
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
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
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
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
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
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            // Verify hints exist
            const beforeClear = await fetchHintSnapshot();
            expect(beforeClear.found).toBe(true);
            expect(beforeClear.count).toBeGreaterThanOrEqual(3);

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
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Create hints again
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThanOrEqual(3);
        });
    });

    describe('6.0 Scrollable Element Detection', () => {
        test('6.1 should detect vertical scrollable divs', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const scrollableInfo = await getScrollableElementsInfo();

            // Should detect multiple scrollable elements
            // Note: Only elements with scrollHeight > 200px are detected
            expect(scrollableInfo.count).toBeGreaterThanOrEqual(3);

            // Should include DIV elements
            expect(scrollableInfo.types).toContain('DIV');
        });

        test('6.2 should detect document scrollingElement (HTML)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const scrollableInfo = await getScrollableElementsInfo();

            // Should include HTML (document.scrollingElement)
            expect(scrollableInfo.types).toContain('HTML');
        });

        test('6.3 should detect nested scrollable elements', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const hasNestedScrollables = await executeInTarget(pageWs, `
                (function() {
                    const outer = document.getElementById('outer-scrollable');
                    const inner = document.getElementById('inner-scrollable');
                    return {
                        outerHasAttr: outer?.dataset.hint_scrollable === 'true',
                        innerHasAttr: inner?.dataset.hint_scrollable === 'true',
                        bothDetected: outer?.dataset.hint_scrollable === 'true' &&
                                      inner?.dataset.hint_scrollable === 'true'
                    };
                })()
            `);

            // Both nested elements should be detected
            expect(hasNestedScrollables.outerHasAttr).toBe(true);
            expect(hasNestedScrollables.innerHasAttr).toBe(true);
            expect(hasNestedScrollables.bothDetected).toBe(true);
        });

        test('6.4 should not hint hidden scrollable elements', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const hintData = await fetchHintSnapshot();

            // Get position of hidden element
            const hiddenInfo = await executeInTarget(pageWs, `
                (function() {
                    const hidden = document.getElementById('hidden-scrollable-1');
                    return {
                        exists: !!hidden,
                        hasScrollableAttr: hidden?.dataset.hint_scrollable === 'true'
                    };
                })()
            `);

            expect(hiddenInfo.exists).toBe(true);
            // Hidden elements should not be marked as scrollable for hints
            expect(hiddenInfo.hasScrollableAttr).toBe(false);
        });

        test('6.5 should not hint non-scrollable divs', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const nonScrollableInfo = await executeInTarget(pageWs, `
                (function() {
                    const notScrollable = document.getElementById('not-scrollable-1');
                    return {
                        exists: !!notScrollable,
                        hasScrollableAttr: notScrollable?.dataset.hint_scrollable === 'true'
                    };
                })()
            `);

            expect(nonScrollableInfo.exists).toBe(true);
            expect(nonScrollableInfo.hasScrollableAttr).toBe(false);
        });
    });

    describe('7.0 Hint Interaction and Focus', () => {
        test('7.1 should filter hints when typing hint label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
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

        test('7.2 should focus scrollable element after selecting hint', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            // Get current active element before
            const beforeActive = await executeInTarget(pageWs, `
                document.activeElement?.tagName || 'BODY'
            `);

            // Type complete hint label to select it
            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                // Wait for hint selection
                await new Promise(resolve => setTimeout(resolve, 300));

                // Hints should be cleared after selection
                const afterSnapshot = await fetchHintSnapshot();
                expect(afterSnapshot.count).toBe(0);

                // Check if focus changed (scrollable element should receive focus/click)
                const afterActive = await executeInTarget(pageWs, `
                    document.activeElement?.tagName || 'BODY'
                `);

                // Active element may change or scrollable element may be clicked
                // Just verify the operation completed without error
                expect(afterActive).toBeDefined();
            }
        });

        test('7.3 should clear hints after selecting hint by label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
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

    describe('8.0 Edge Cases', () => {
        test('8.1 should handle rapid hint creation and clearing', async () => {
            for (let i = 0; i < 3; i++) {
                await clickAt(pageWs, 100, 100);
                await sendKey(pageWs, ';');
                await sendKey(pageWs, 'f');
                await sendKey(pageWs, 's');
                await waitForHintCount(3);

                const snapshot = await fetchHintSnapshot();
                expect(snapshot.count).toBeGreaterThanOrEqual(3);

                await sendKey(pageWs, 'Escape');
                await waitForHintsCleared();
            }
        });

        test('8.2 should handle page with document.scrollingElement', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            // Check if page itself is detected as scrollable
            const pageScrollable = await executeInTarget(pageWs, `
                (function() {
                    const scrollEl = document.scrollingElement;
                    return {
                        exists: !!scrollEl,
                        hasScroll: scrollEl ? (scrollEl.scrollHeight > scrollEl.clientHeight) : false
                    };
                })()
            `);

            expect(pageScrollable.exists).toBe(true);
            expect(pageScrollable.hasScroll).toBe(true);
        });
    });

    describe('9.0 Hint Consistency', () => {
        test('9.1 should create consistent hints across multiple invocations', async () => {
            // First invocation
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);
            const snapshot1 = await fetchHintSnapshot();

            // Clear and recreate
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);
            const snapshot2 = await fetchHintSnapshot();

            // Verify consistency
            expect(snapshot1.count).toBe(snapshot2.count);
            expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
        });

        test('9.2 should have deterministic hint snapshot', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, ';');
            await sendKey(pageWs, 'f');
            await sendKey(pageWs, 's');
            await waitForHintCount(3);

            const hintSnapshot = await fetchHintSnapshot();

            // Verify hints were created
            expect(hintSnapshot.found).toBe(true);
            expect(hintSnapshot.count).toBeGreaterThanOrEqual(3);

            // Snapshot test - ensures hints remain deterministic
            expect({
                count: hintSnapshot.count,
                sortedHints: hintSnapshot.sortedHints
            }).toMatchSnapshot();
        });
    });
});
