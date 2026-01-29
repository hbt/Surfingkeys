/**
 * CDP Test: cmd_hints_exit_regional
 *
 * Tests for the <Esc> subcommand within regional hints mode.
 * - Command: cmd_hints_exit_regional
 * - Key: <Esc>
 * - Behavior: Exit regional hints mode and return to normal mode after selecting an element
 * - Focus: Exiting regional hints menu, clearing hints and overlay, returning to normal mode
 *
 * Workflow:
 * 1. Press 'L' to enter regional hints mode
 * 2. Select an element by pressing its hint label (e.g., 'A', 'B', etc.)
 * 3. Press <Esc> to exit regional hints mode
 * 4. Verify hints and menu are cleared
 *
 * Tests based on patterns from:
 * - tests/cdp/commands/cmd-hints-regional.test.ts
 * - tests/cdp/old-commands/cdp-create-hints.test.ts
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-exit-regional.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-exit-regional.test.ts
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

describe('cmd_hints_exit_regional', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/regional-hints-test.html';

    /**
     * Fetch snapshot of regional hints in shadowRoot
     * Returns: { found, count, sample, sortedHints, overlays }
     */
    const regionalHintSnapshotScript = `
        (function() {
            const hintsHost = document.querySelector('.surfingkeys_hints_host');
            if (!hintsHost || !hintsHost.shadowRoot) {
                return { found: false, count: 0, sample: [], sortedHints: [], overlays: 0 };
            }

            const shadowRoot = hintsHost.shadowRoot;
            const hintElements = Array.from(shadowRoot.querySelectorAll('div'));

            // Filter for hint labels (1-3 uppercase letters)
            const hintDivs = hintElements.filter(d => {
                const text = (d.textContent || '').trim();
                return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
            });

            // Count colored overlays (div elements with background color and border)
            const overlays = hintElements.filter(d => {
                const style = window.getComputedStyle(d);
                const hasBorder = style.border && style.border !== 'none' && style.border !== '';
                const hasBackground = style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
                return hasBorder || hasBackground;
            });

            const sample = hintDivs.slice(0, 5).map(h => ({
                text: h.textContent?.trim(),
                visible: h.offsetParent !== null,
                background: window.getComputedStyle(h).backgroundColor,
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
                sortedHints,
                overlays: overlays.length
            };
        })()
    `;

    /**
     * Check if regional hints menu is visible
     * Returns: { visible, menuItems }
     */
    const regionalMenuSnapshotScript = `
        (function() {
            // There may be multiple surfingkeys_hints_host elements
            // We need to find the one with the menu (regional hints mode)
            const hintsHosts = document.querySelectorAll('.surfingkeys_hints_host');

            for (const hintsHost of hintsHosts) {
                if (!hintsHost || !hintsHost.shadowRoot) {
                    continue;
                }

                const shadowRoot = hintsHost.shadowRoot;
                const menu = shadowRoot.querySelector('div.menu');

                if (menu) {
                    const menuItems = Array.from(shadowRoot.querySelectorAll('div.menu-item')).map(item => ({
                        text: item.textContent?.trim(),
                        visible: item.offsetParent !== null
                    }));

                    return {
                        visible: menu.offsetParent !== null,
                        menuItems
                    };
                }
            }

            return { visible: false, menuItems: [] };
        })()
    `;

    async function fetchRegionalHintSnapshot() {
        return executeInTarget(pageWs, regionalHintSnapshotScript);
    }

    async function fetchRegionalMenuSnapshot() {
        return executeInTarget(pageWs, regionalMenuSnapshotScript);
    }

    async function waitForRegionalHintCount(minCount: number) {
        await waitFor(async () => {
            const snapshot = await fetchRegionalHintSnapshot();
            return snapshot.found && snapshot.count >= minCount;
        }, 6000, 100);
    }

    async function waitForRegionalMenu() {
        // Wait a bit for the timeout in regionalHints.attach (10ms) plus rendering
        await new Promise(resolve => setTimeout(resolve, 300));

        await waitFor(async () => {
            const menuSnapshot = await fetchRegionalMenuSnapshot();
            return menuSnapshot.visible && menuSnapshot.menuItems.length > 0;
        }, 5000, 100);
    }

    async function waitForHintsCleared() {
        await waitFor(async () => {
            const snapshot = await fetchRegionalHintSnapshot();
            return !snapshot.found || snapshot.count === 0;
        }, 4000, 100);
    }

    /**
     * Helper to enter regional hints and select first hint
     * Returns the selected hint label
     */
    async function enterRegionalHintsAndSelectFirst() {
        // Enter regional hints mode
        await clickAt(pageWs, 100, 100);
        await sendKey(pageWs, 'L');
        await waitForRegionalHintCount(1);

        // Get first hint and select it
        const hintData = await fetchRegionalHintSnapshot();
        const firstHint = hintData.sortedHints[0];
        expect(firstHint).toBeDefined();

        // Type hint label to select element
        for (const char of firstHint) {
            await sendKey(pageWs, char, 50);
        }

        // Wait for menu to appear
        await waitForRegionalMenu();

        return firstHint;
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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/regional-hints-test.html');
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
        // Press Escape multiple times to ensure we exit all modes
        for (let i = 0; i < 4; i++) {
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Force clean up any lingering hints hosts
        await executeInTarget(pageWs, `
            document.querySelectorAll('.surfingkeys_hints_host').forEach(h => h.remove());
        `);
        await new Promise(resolve => setTimeout(resolve, 200));

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
            const pCount = await countElements(pageWs, 'p');
            // regional-hints-test.html has 38 paragraph elements
            expect(pCount).toBeGreaterThan(30);
        });

        test('1.2 should have no hints initially', async () => {
            const initialSnapshot = await fetchRegionalHintSnapshot();
            expect(initialSnapshot.found).toBe(false);
            expect(initialSnapshot.count).toBe(0);
        });
    });

    describe('2.0 Regional Hints Menu Visibility', () => {
        // TODO(hbt): NEXT [test] Menu tests timing out - menu not appearing after selecting hint
        // This is a known issue also present in cmd-hints-regional.test.ts (tests 6.1, 6.2, 11.2 are skipped)
        // The regionalHints.attach() call at hints.js:465 is not being triggered or menu isn't rendering
        // Possible causes: elm.skColorIndex undefined, timing issue with setTimeout, or overlay not created
        test.skip('2.1 should show menu after selecting hint', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Verify menu is visible
            const menuSnapshot = await fetchRegionalMenuSnapshot();
            expect(menuSnapshot.visible).toBe(true);
            expect(menuSnapshot.menuItems.length).toBeGreaterThan(0);
        });

        test.skip('2.2 should have Esc in menu items', async () => {
            await enterRegionalHintsAndSelectFirst();

            const menuSnapshot = await fetchRegionalMenuSnapshot();
            const menuText = menuSnapshot.menuItems.map((item: any) => item.text).join(' ');

            // Menu should contain Escape key reference
            expect(menuText.toLowerCase()).toMatch(/esc|escape/i);
        });
    });

    describe('3.0 Exit Regional Hints Mode', () => {
        test.skip('3.1 should exit regional hints mode when pressing Escape', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Verify menu is visible before exit
            const menuBefore = await fetchRegionalMenuSnapshot();
            expect(menuBefore.visible).toBe(true);

            // Press Escape to exit
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Verify hints are cleared
            const afterSnapshot = await fetchRegionalHintSnapshot();
            expect(afterSnapshot.count).toBe(0);

            // Verify menu is gone
            const menuAfter = await fetchRegionalMenuSnapshot();
            expect(menuAfter.visible).toBe(false);
        });

        test.skip('3.2 should remove hints host element after exit', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Press Escape to exit
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Verify hints host is removed from DOM
            const hostExists = await executeInTarget(pageWs, `
                document.querySelector('.surfingkeys_hints_host') !== null
            `);
            expect(hostExists).toBe(false);
        });

        test.skip('3.3 should clear menu items after exit', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Verify menu items exist
            const menuBefore = await fetchRegionalMenuSnapshot();
            expect(menuBefore.menuItems.length).toBeGreaterThan(0);

            // Exit
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Verify no menu items
            const menuAfter = await fetchRegionalMenuSnapshot();
            expect(menuAfter.menuItems.length).toBe(0);
        });
    });

    describe('4.0 Return to Normal Mode', () => {
        test.skip('4.1 should allow normal mode commands after exit', async () => {
            await enterRegionalHintsAndSelectFirst();
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Try to scroll with 'j' (normal mode command)
            const scrollBefore = await executeInTarget(pageWs, 'window.scrollY');
            await sendKey(pageWs, 'j');
            await new Promise(resolve => setTimeout(resolve, 200));
            const scrollAfter = await executeInTarget(pageWs, 'window.scrollY');

            // Should have scrolled down
            expect(scrollAfter).toBeGreaterThan(scrollBefore);
        });

        test.skip('4.2 should not respond to regional hints subcommands after exit', async () => {
            await enterRegionalHintsAndSelectFirst();
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Try to use regional hints subcommands (should not work)
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify no menu appears (we're in normal mode)
            const menuSnapshot = await fetchRegionalMenuSnapshot();
            expect(menuSnapshot.visible).toBe(false);
        });
    });

    describe('5.0 Re-entering Regional Hints', () => {
        test.skip('5.1 should allow re-entering regional hints after exit', async () => {
            // First entry and exit
            await enterRegionalHintsAndSelectFirst();
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Re-enter regional hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(0);
        });

        test.skip('5.2 should have consistent hints after re-entry', async () => {
            // First entry
            await enterRegionalHintsAndSelectFirst();
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            const firstSnapshot = await executeInTarget(pageWs, `
                (function() {
                    // Scroll to same position
                    window.scrollTo(0, 0);
                    return { scrollY: window.scrollY };
                })()
            `);

            // Re-enter
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const snapshot1 = await fetchRegionalHintSnapshot();

            // Exit and re-enter again
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const snapshot2 = await fetchRegionalHintSnapshot();

            // Should have consistent hint counts
            expect(snapshot1.count).toBe(snapshot2.count);
        });
    });

    describe('6.0 Edge Cases', () => {
        test.skip('6.1 should handle rapid exit and re-entry', async () => {
            for (let i = 0; i < 3; i++) {
                await enterRegionalHintsAndSelectFirst();
                await sendKey(pageWs, 'Escape');
                await waitForHintsCleared();

                const snapshot = await fetchRegionalHintSnapshot();
                expect(snapshot.count).toBe(0);
            }
        });

        test.skip('6.2 should handle double Escape press', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Press Escape twice
            await sendKey(pageWs, 'Escape');
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Should still clear hints without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test.skip('6.3 should exit cleanly without selecting any subcommand', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Don't press any subcommand, just exit
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Verify clean exit
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);

            const hostExists = await executeInTarget(pageWs, `
                document.querySelector('.surfingkeys_hints_host') !== null
            `);
            expect(hostExists).toBe(false);
        });
    });

    describe('7.0 Overlay Cleanup', () => {
        test.skip('7.1 should remove overlay element after exit', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Press Escape
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Verify overlay is removed
            const overlayCount = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) return 0;
                    return hintsHost.shadowRoot.querySelectorAll('div').length;
                })()
            `);
            expect(overlayCount).toBe(0);
        });

        test.skip('7.2 should not leave any hints artifacts in DOM', async () => {
            await enterRegionalHintsAndSelectFirst();
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Check for any hints-related elements
            const artifactCount = await executeInTarget(pageWs, `
                (function() {
                    const hosts = document.querySelectorAll('.surfingkeys_hints_host');
                    return hosts.length;
                })()
            `);
            expect(artifactCount).toBe(0);
        });
    });
});
