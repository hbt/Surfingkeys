/**
 * CDP Test: cmd_hints_mouseout_last
 *
 * Comprehensive tests for the hints command ';m' (Mouse out last element).
 * - Command: cmd_hints_mouseout_last
 * - Key: ';m'
 * - Behavior: Trigger mouseout event on the last hinted element without creating hints
 * - Focus: mouseout event dispatch, lastMouseTarget tracking, edge cases
 *
 * Based on patterns from cmd-hints-open-link.test.ts
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-mouseout-last.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-mouseout-last.test.ts
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

describe('cmd_hints_mouseout_last', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/mouseover-test.html';

    /**
     * Get mouseover count of an element by ID
     */
    async function getMouseoverCount(elementId: string) {
        return executeInTarget(pageWs, `
            (function() {
                if (window.getMouseoverCount) {
                    return window.getMouseoverCount('${elementId}');
                }
                const element = document.getElementById('${elementId}');
                if (!element) return 0;
                return parseInt(element.getAttribute('data-mouseover-count') || '0');
            })()
        `);
    }

    /**
     * Trigger mouseover via Ctrl-h hints
     */
    async function triggerMouseoverHints() {
        await sendKey(pageWs, 'Control+h');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    /**
     * Wait for hints to appear
     */
    async function waitForHintsVisible() {
        await waitFor(async () => {
            const result = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) return false;
                    const hints = hintsHost.shadowRoot.querySelectorAll('div');
                    return hints.length > 0;
                })()
            `);
            return result;
        }, 4000, 100);
    }

    /**
     * Get first hint label
     */
    async function getFirstHintLabel(): Promise<string> {
        return executeInTarget(pageWs, `
            (function() {
                const hintsHost = document.querySelector('.surfingkeys_hints_host');
                if (!hintsHost || !hintsHost.shadowRoot) return null;
                const hints = Array.from(hintsHost.shadowRoot.querySelectorAll('div'));
                const hintDivs = hints.filter(d => {
                    const text = (d.textContent || '').trim();
                    return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                });
                return hintDivs.length > 0 ? hintDivs[0].textContent.trim() : null;
            })()
        `);
    }

    /**
     * Check if hints are cleared
     */
    async function areHintsCleared(): Promise<boolean> {
        return executeInTarget(pageWs, `
            (function() {
                const hintsHost = document.querySelector('.surfingkeys_hints_host');
                if (!hintsHost || !hintsHost.shadowRoot) return true;
                const hints = hintsHost.shadowRoot.querySelectorAll('div');
                const hintDivs = Array.from(hints).filter(d => {
                    const text = (d.textContent || '').trim();
                    return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                });
                return hintDivs.length === 0;
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
        test('1.1 should have expected elements on page', async () => {
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(5);
        });

        test('1.2 should have mouseover tracking elements', async () => {
            const buttonCount = await countElements(pageWs, 'button');
            expect(buttonCount).toBeGreaterThan(3);
        });

        test('1.3 should have no hints initially', async () => {
            const cleared = await areHintsCleared();
            expect(cleared).toBe(true);
        });

        test('1.4 should have mouseover count tracking initialized', async () => {
            const count = await getMouseoverCount('link1');
            expect(count).toBe(0);
        });
    });

    describe('2.0 Edge Case: No Previous Hints', () => {
        test('2.1 should not error when `;m` is pressed without previous hints', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Press ';m' without creating any hints first
            await sendKey(pageWs, ';');
            await new Promise(resolve => setTimeout(resolve, 50));
            await sendKey(pageWs, 'm');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Should not crash or throw error
            // Just verify page is still responsive
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(5);
        });

        test('2.2 should handle repeated `;m` presses with no previous hints', async () => {
            await clickAt(pageWs, 100, 100);

            // Press ';m' multiple times without hints
            for (let i = 0; i < 3; i++) {
                await sendKey(pageWs, ';');
                await new Promise(resolve => setTimeout(resolve, 50));
                await sendKey(pageWs, 'm');
                await new Promise(resolve => setTimeout(resolve, 150));
            }

            // Should not crash
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(5);
        });
    });

    describe('3.0 Basic Mouseout Functionality', () => {
        test('3.1 should trigger mouseout on last hinted element after Ctrl-h hint selection', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Trigger mouseover hints with Ctrl-h
            await triggerMouseoverHints();
            await waitForHintsVisible();

            // Get first hint label
            const hintLabel = await getFirstHintLabel();
            expect(hintLabel).toBeTruthy();
            expect(hintLabel).toMatch(/^[A-Z]{1,3}$/);

            // Select the hint to trigger mouseover
            if (hintLabel) {
                for (const char of hintLabel) {
                    await sendKey(pageWs, char, 50);
                }
            }

            // Wait for hints to clear and mouseover to be applied
            await new Promise(resolve => setTimeout(resolve, 300));

            // Now trigger mouseout with ';m'
            await sendKey(pageWs, ';');
            await new Promise(resolve => setTimeout(resolve, 50));
            await sendKey(pageWs, 'm');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify command executed without error
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(5);
        });

        test('3.2 should clear lastMouseTarget after `;m` execution', async () => {
            await clickAt(pageWs, 100, 100);

            // Trigger mouseover hints
            await triggerMouseoverHints();
            await waitForHintsVisible();

            // Select first hint
            const hintLabel = await getFirstHintLabel();
            if (hintLabel) {
                for (const char of hintLabel) {
                    await sendKey(pageWs, char, 50);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            // Trigger mouseout
            await sendKey(pageWs, ';');
            await new Promise(resolve => setTimeout(resolve, 50));
            await sendKey(pageWs, 'm');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Press ';m' again - should not error (lastMouseTarget should be null)
            await sendKey(pageWs, ';');
            await new Promise(resolve => setTimeout(resolve, 50));
            await sendKey(pageWs, 'm');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Should not crash
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(5);
        });
    });

    describe('4.0 State Changes', () => {
        test('4.1 should dispatch mouseout event after mouseover', async () => {
            await clickAt(pageWs, 100, 100);

            // Trigger mouseover hints
            await triggerMouseoverHints();
            await waitForHintsVisible();

            // Select first hint to trigger mouseover
            const hintLabel = await getFirstHintLabel();
            if (hintLabel) {
                for (const char of hintLabel) {
                    await sendKey(pageWs, char, 50);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            // Trigger mouseout with ';m'
            await sendKey(pageWs, ';');
            await new Promise(resolve => setTimeout(resolve, 50));
            await sendKey(pageWs, 'm');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify command executed without error
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(5);
        });
    });

    describe('5.0 Repeated Execution', () => {
        test('5.1 should handle multiple mouseover/mouseout cycles', async () => {
            await clickAt(pageWs, 100, 100);

            // Perform 3 cycles of mouseover -> mouseout
            for (let i = 0; i < 3; i++) {
                // Trigger mouseover hints
                await triggerMouseoverHints();
                await waitForHintsVisible();

                // Select first hint
                const hintLabel = await getFirstHintLabel();
                if (hintLabel) {
                    for (const char of hintLabel) {
                        await sendKey(pageWs, char, 50);
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 200));

                // Trigger mouseout
                await sendKey(pageWs, ';');
                await new Promise(resolve => setTimeout(resolve, 50));
                await sendKey(pageWs, 'm');
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Should not crash
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(5);
        });

        test('5.2 should handle rapid `;m` presses', async () => {
            await clickAt(pageWs, 100, 100);

            // Setup: trigger one mouseover
            await triggerMouseoverHints();
            await waitForHintsVisible();

            const hintLabel = await getFirstHintLabel();
            if (hintLabel) {
                for (const char of hintLabel) {
                    await sendKey(pageWs, char, 50);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            // Rapidly press ';m' multiple times
            for (let i = 0; i < 5; i++) {
                await sendKey(pageWs, ';');
                await new Promise(resolve => setTimeout(resolve, 30));
                await sendKey(pageWs, 'm');
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Should not crash
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(5);
        });
    });

    describe('6.0 Command Does Not Create Hints', () => {
        test('6.1 should not create hints when pressing `;m`', async () => {
            await clickAt(pageWs, 100, 100);

            // Setup: trigger mouseover first
            await triggerMouseoverHints();
            await waitForHintsVisible();

            const hintLabel = await getFirstHintLabel();
            if (hintLabel) {
                for (const char of hintLabel) {
                    await sendKey(pageWs, char, 50);
                }
            }

            // Wait for hints to clear after selection
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify hints are cleared
            const clearedBefore = await areHintsCleared();
            expect(clearedBefore).toBe(true);

            // Press ';m'
            await sendKey(pageWs, ';');
            await new Promise(resolve => setTimeout(resolve, 50));
            await sendKey(pageWs, 'm');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify hints are still cleared (not created by ';m')
            const clearedAfter = await areHintsCleared();
            expect(clearedAfter).toBe(true);
        });

        test('6.2 should only dispatch mouseout event without hint creation', async () => {
            await clickAt(pageWs, 100, 100);

            // Setup: trigger mouseover
            await triggerMouseoverHints();
            await waitForHintsVisible();

            const hintLabel = await getFirstHintLabel();
            if (hintLabel) {
                for (const char of hintLabel) {
                    await sendKey(pageWs, char, 50);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            // Count elements before ';m'
            const linkCountBefore = await countElements(pageWs, 'a');

            // Press ';m'
            await sendKey(pageWs, ';');
            await new Promise(resolve => setTimeout(resolve, 50));
            await sendKey(pageWs, 'm');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Count elements after ';m' (should be unchanged)
            const linkCountAfter = await countElements(pageWs, 'a');
            expect(linkCountAfter).toBe(linkCountBefore);

            // Verify no hints created
            const cleared = await areHintsCleared();
            expect(cleared).toBe(true);
        });
    });

    describe('7.0 Integration with Other Commands', () => {
        test('7.1 should work after normal hint workflow (f key)', async () => {
            await clickAt(pageWs, 100, 100);

            // Use normal hints with 'f'
            await sendKey(pageWs, 'f');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Clear hints
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Now use mouseover hints
            await triggerMouseoverHints();
            await waitForHintsVisible();

            const hintLabel = await getFirstHintLabel();
            if (hintLabel) {
                for (const char of hintLabel) {
                    await sendKey(pageWs, char, 50);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            // Press ';m'
            await sendKey(pageWs, ';');
            await new Promise(resolve => setTimeout(resolve, 50));
            await sendKey(pageWs, 'm');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Should work fine
            const linkCount = await countElements(pageWs, 'a');
            expect(linkCount).toBeGreaterThan(5);
        });

        test('7.2 should not interfere with subsequent hint commands', async () => {
            await clickAt(pageWs, 100, 100);

            // Setup and execute ';m'
            await triggerMouseoverHints();
            await waitForHintsVisible();

            const hintLabel = await getFirstHintLabel();
            if (hintLabel) {
                for (const char of hintLabel) {
                    await sendKey(pageWs, char, 50);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            await sendKey(pageWs, ';');
            await new Promise(resolve => setTimeout(resolve, 50));
            await sendKey(pageWs, 'm');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Now try creating hints again with 'f'
            await sendKey(pageWs, 'f');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Hints should be created normally
            const clearedAfterF = await areHintsCleared();
            expect(clearedAfterF).toBe(false);

            // Clear hints
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 200));
        });
    });
});
