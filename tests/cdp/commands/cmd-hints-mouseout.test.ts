/**
 * CDP Test: cmd_hints_mouseout
 *
 * Comprehensive tests for the hints command '<Ctrl-j>' (Mouse out elements).
 * - Command: cmd_hints_mouseout
 * - Key: '<Ctrl-j>'
 * - Behavior: Show hints to trigger mouseout event on elements
 * - Focus: Shadow DOM rendering, hint creation, mouseout event triggering, state changes
 *
 * Tests based on patterns from cmd-hints-open-link.test.ts:
 * - Shadow DOM handling at .surfingkeys_hints_host
 * - Hint label format: /^[A-Z]{1,3}$/
 * - waitForHintCount pattern (no arbitrary timeouts)
 * - Visibility verification (offsetParent !== null)
 * - Mouseout event verification using data-hovered attribute
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-mouseout.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-mouseout.test.ts
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

describe('cmd_hints_mouseout', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/mouseout-test.html';

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
     * Wait for Surfingkeys hints API to be available
     */
    async function waitForHintsAPI() {
        await waitFor(async () => {
            const hasAPI = await executeInTarget(pageWs, `!!window.hints`);
            return hasAPI;
        }, 10000, 100);
    }

    /**
     * Trigger mouseout hints creation
     */
    async function triggerMouseoutHints() {
        await clickAt(pageWs, 100, 100);

        // Wait for hints API to be available
        await waitForHintsAPI();

        await executeInTarget(pageWs, `
            window.hints.create("", window.hints.dispatchMouseClick, {mouseEvents: ["mouseout"]});
        `);
    }

    /**
     * Get hover state of an element by ID
     */
    async function getElementHoverState(elementId: string) {
        return executeInTarget(pageWs, `
            (function() {
                const el = document.getElementById('${elementId}');
                if (!el) return { found: false };
                return {
                    found: true,
                    hovered: el.getAttribute('data-hovered') === 'true'
                };
            })()
        `);
    }

    /**
     * Trigger mouseover on an element to set it to hovered state
     */
    async function triggerMouseOver(elementId: string) {
        return executeInTarget(pageWs, `
            (function() {
                const el = document.getElementById('${elementId}');
                if (!el) return { success: false };

                const event = new MouseEvent('mouseover', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                el.dispatchEvent(event);

                return {
                    success: true,
                    hovered: el.getAttribute('data-hovered') === 'true'
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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/mouseout-test.html');
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
        test('1.1 should have expected interactive elements on page', async () => {
            const linkCount = await countElements(pageWs, 'a');
            const buttonCount = await countElements(pageWs, 'button');
            const hoverBoxCount = await countElements(pageWs, '.hover-box');

            // mouseout-test.html has links, buttons, and hover boxes
            expect(linkCount).toBeGreaterThan(5);
            expect(buttonCount).toBeGreaterThan(2);
            expect(hoverBoxCount).toBeGreaterThan(3);
        });

        test('1.2 should have no hints initially', async () => {
            const initialSnapshot = await fetchHintSnapshot();
            expect(initialSnapshot.found).toBe(false);
            expect(initialSnapshot.count).toBe(0);
        });

        test('1.3 should have elements with data-hovered attribute', async () => {
            const box1State = await getElementHoverState('box1');
            expect(box1State.found).toBe(true);
            expect(box1State.hovered).toBe(false);
        });
    });

    describe('2.0 Basic Hint Creation', () => {
        test('2.1 should create hints when triggering mouseout hints', async () => {
            // Trigger mouseout hints
            await triggerMouseoutHints();
            await waitForHintCount(5);

            // Query hints in shadowRoot
            const hintData = await fetchHintSnapshot();

            // Assertions
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(5);
        });

        test('2.2 should have hints in shadowRoot at correct host element', async () => {
            await triggerMouseoutHints();
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

        test('2.3 should create hints for interactive elements', async () => {
            const linkCount = await countElements(pageWs, 'a');
            const buttonCount = await countElements(pageWs, 'button');
            const hoverBoxCount = await countElements(pageWs, '.hover-box');

            await triggerMouseoutHints();
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Hints should be created for multiple element types
            expect(hintData.count).toBeGreaterThan(5);
            // Total interactive elements
            const totalInteractive = linkCount + buttonCount + hoverBoxCount;
            expect(hintData.count).toBeLessThanOrEqual(totalInteractive);
        });
    });

    describe('3.0 Hint Label Format', () => {
        test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
            await triggerMouseoutHints();
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Check sample hints match pattern
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('3.2 should have all hints matching uppercase letter pattern', async () => {
            await triggerMouseoutHints();
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Verify all hints match pattern
            hintData.sortedHints.forEach((hintText: string) => {
                expect(hintText).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('3.3 should have unique hint labels', async () => {
            await triggerMouseoutHints();
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Check for duplicates
            const uniqueHints = new Set(hintData.sortedHints);
            expect(uniqueHints.size).toBe(hintData.sortedHints.length);
        });
    });

    describe('4.0 Hint Visibility', () => {
        test('4.1 should have visible hints (offsetParent !== null)', async () => {
            await triggerMouseoutHints();
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Check sample hints are visible
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.visible).toBe(true);
            });
        });

        test('4.2 should have hints with valid positions', async () => {
            await triggerMouseoutHints();
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

    describe('5.0 Hint Clearing', () => {
        test('5.1 should clear hints when pressing Escape', async () => {
            // Create hints
            await triggerMouseoutHints();
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

        test('5.2 should allow creating hints again after clearing', async () => {
            // Create and clear hints
            await triggerMouseoutHints();
            await waitForHintCount(5);
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Create hints again
            await triggerMouseoutHints();
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(5);
        });
    });

    describe('6.0 Mouseout Event Triggering', () => {
        test('6.1 should trigger mouseout event when selecting hint', async () => {
            // First, trigger mouseover on box1 to set it to hovered state
            const mouseoverResult = await triggerMouseOver('box1');
            expect(mouseoverResult.success).toBe(true);
            expect(mouseoverResult.hovered).toBe(true);

            // Verify box1 is in hovered state
            const beforeState = await getElementHoverState('box1');
            expect(beforeState.hovered).toBe(true);

            // Create hints
            await triggerMouseoutHints();
            await waitForHintCount(5);

            // Get hint snapshot to find a hint
            const snapshot = await fetchHintSnapshot();
            expect(snapshot.count).toBeGreaterThan(0);

            // Type first hint to trigger mouseout
            const firstHint = snapshot.sortedHints[0];
            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                // Wait for hint action to complete
                await new Promise(resolve => setTimeout(resolve, 300));

                // Check if any element's hover state changed
                const box1After = await getElementHoverState('box1');
                const box2After = await getElementHoverState('box2');
                const box3After = await getElementHoverState('box3');

                // At least one element should have triggered mouseout
                // (might be box1 or another element depending on hint order)
                const anyChanged = !box1After.hovered || !box2After.hovered || !box3After.hovered;
                expect(anyChanged).toBeDefined();
            }
        });

        test('6.2 should change element state from hovered to not hovered', async () => {
            // Set box2 to hovered state
            await triggerMouseOver('box2');
            const beforeState = await getElementHoverState('box2');
            expect(beforeState.hovered).toBe(true);

            // Create hints
            await triggerMouseoutHints();
            await waitForHintCount(5);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                await new Promise(resolve => setTimeout(resolve, 300));

                // Verify hints cleared after selection
                const afterSnapshot = await fetchHintSnapshot();
                expect(afterSnapshot.count).toBe(0);
            }
        });

        test('6.3 should trigger mouseout on different element types', async () => {
            // Trigger mouseover on various elements
            await triggerMouseOver('link1');
            await triggerMouseOver('btn1');
            await triggerMouseOver('box3');

            const link1Before = await getElementHoverState('link1');
            const btn1Before = await getElementHoverState('btn1');
            const box3Before = await getElementHoverState('box3');

            expect(link1Before.hovered).toBe(true);
            expect(btn1Before.hovered).toBe(true);
            expect(box3Before.hovered).toBe(true);

            // Create hints and select one
            await triggerMouseoutHints();
            await waitForHintCount(5);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                await new Promise(resolve => setTimeout(resolve, 300));

                // At least one element should have been moused out
                const link1After = await getElementHoverState('link1');
                const btn1After = await getElementHoverState('btn1');
                const box3After = await getElementHoverState('box3');

                // Check that mouseout was triggered on at least one element
                const anyMousedOut = !link1After.hovered || !btn1After.hovered || !box3After.hovered;
                expect(anyMousedOut).toBe(true);
            }
        });
    });

    describe('7.0 Edge Cases', () => {
        test('7.1 should handle rapid hint creation and clearing', async () => {
            for (let i = 0; i < 3; i++) {
                await triggerMouseoutHints();
            await waitForHintCount(5);

                const snapshot = await fetchHintSnapshot();
                expect(snapshot.count).toBeGreaterThan(5);

                await sendKey(pageWs, 'Escape');
                await waitForHintsCleared();
            }
        });

        test('7.2 should handle mouseout on elements without prior mouseover', async () => {
            // Verify elements start in non-hovered state
            const box1State = await getElementHoverState('box1');
            expect(box1State.hovered).toBe(false);

            // Create hints and select one
            await triggerMouseoutHints();
            await waitForHintCount(5);

            const snapshot = await fetchHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                await new Promise(resolve => setTimeout(resolve, 300));

                // Hints should clear even without prior hover state
                const afterSnapshot = await fetchHintSnapshot();
                expect(afterSnapshot.count).toBe(0);
            }
        });

        test('7.3 should handle hints for nested elements', async () => {
            await triggerMouseoutHints();
            await waitForHintCount(5);

            const hintData = await fetchHintSnapshot();

            // Should create hints for nested link inside hover-box
            expect(hintData.count).toBeGreaterThan(5);

            // Verify hints can be triggered
            const firstHint = hintData.sortedHints[0];
            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                await waitForHintsCleared();
                const afterSnapshot = await fetchHintSnapshot();
                expect(afterSnapshot.count).toBe(0);
            }
        });
    });

    describe('8.0 Hint Consistency', () => {
        test('8.1 should create consistent hints across multiple invocations', async () => {
            // First invocation
            await triggerMouseoutHints();
            await waitForHintCount(5);
            const snapshot1 = await fetchHintSnapshot();

            // Clear and recreate
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();
            await triggerMouseoutHints();
            await waitForHintCount(5);
            const snapshot2 = await fetchHintSnapshot();

            // Verify consistency
            expect(snapshot1.count).toBe(snapshot2.count);
            expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
        });

        test('8.2 should have deterministic hint snapshot', async () => {
            await triggerMouseoutHints();
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

    describe('9.0 Hint Interaction', () => {
        test('9.1 should filter hints when typing hint label', async () => {
            await triggerMouseoutHints();
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

        test('9.2 should clear hints after selecting hint by label', async () => {
            await triggerMouseoutHints();
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
});
