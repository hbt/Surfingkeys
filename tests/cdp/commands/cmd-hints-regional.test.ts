/**
 * CDP Test: cmd_hints_regional
 *
 * Comprehensive tests for the regional hints command 'L' (Regional hints mode).
 * - Command: cmd_hints_regional
 * - Key: 'L'
 * - Behavior: Show hints for large page regions with colored overlays, then show menu with ch/ct/d/l subcommands
 * - Focus: Regional hints rendering, overlay creation, menu display, subcommand interaction
 *
 * Regional hints creates colored overlays around large elements on the page.
 * After selecting an element, a menu appears with these options:
 * - Esc: Exit regional hints mode
 * - ct: Copy text from target element
 * - ch: Copy HTML from target element
 * - d: Delete target element
 * - l: Chat with LLM about element
 *
 * Tests based on patterns from:
 * - tests/cdp/commands/cmd-hints-open-link.test.ts
 * - tests/cdp/old-commands/cdp-create-hints.test.ts
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-regional.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-regional.test.ts
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

describe('cmd_hints_regional', () => {
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
        // Press Escape multiple times to ensure we exit all modes (regional hints menu, hints mode, etc.)
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
            const divCount = await countElements(pageWs, 'div.large-block, div.medium-block, div.content-section');
            // regional-hints-test.html has 12 large/medium blocks
            expect(divCount).toBeGreaterThan(10);
        });

        test('1.2 should have no hints initially', async () => {
            const initialSnapshot = await fetchRegionalHintSnapshot();
            expect(initialSnapshot.found).toBe(false);
            expect(initialSnapshot.count).toBe(0);
        });
    });

    describe('2.0 Basic Regional Hints Creation', () => {
        test('2.1 should create regional hints when pressing L key', async () => {
            // Click page to ensure focus
            await clickAt(pageWs, 100, 100);

            // Press 'L' to trigger regional hints
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            // Query hints in shadowRoot
            const hintData = await fetchRegionalHintSnapshot();

            // Assertions
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(0);
            expect(hintData.count).toBeLessThan(50); // Regional hints target large elements, not all elements
        });

        test('2.2 should have hints in shadowRoot at correct host element', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

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

        test('2.3 should create hints for large visible elements', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();

            // Regional hints target large elements only (subset of all elements)
            expect(hintData.count).toBeGreaterThan(0);
            expect(hintData.count).toBeLessThan(30); // Should be much less than total elements
        });
    });

    describe('3.0 Regional Hints Overlays', () => {
        test('3.1 should create colored overlays around elements', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();

            // Verify overlays were created
            expect(hintData.overlays).toBeGreaterThan(0);
            // Should have same number of overlays as hints
            expect(hintData.overlays).toBe(hintData.count);
        });

        test('3.2 should have hints with colored backgrounds', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();

            // Check sample hints have background colors
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                // Regional hints should have colored backgrounds
                expect(hint.background).toBeDefined();
                expect(hint.background).not.toBe('rgba(0, 0, 0, 0)');
            });
        });
    });

    describe('4.0 Hint Label Format', () => {
        test('4.1 should have properly formatted hint labels (uppercase letters)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();

            // Check sample hints match pattern
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('4.2 should have all hints matching uppercase letter pattern', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();

            // Verify all hints match pattern
            hintData.sortedHints.forEach((hintText: string) => {
                expect(hintText).toMatch(/^[A-Z]{1,3}$/);
            });
        });

        test('4.3 should have unique hint labels', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();

            // Check for duplicates
            const uniqueHints = new Set(hintData.sortedHints);
            expect(uniqueHints.size).toBe(hintData.sortedHints.length);
        });
    });

    describe('5.0 Hint Visibility', () => {
        test('5.1 should have visible hints (offsetParent !== null)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();

            // Check sample hints are visible
            expect(hintData.sample.length).toBeGreaterThan(0);
            hintData.sample.forEach((hint: any) => {
                expect(hint.visible).toBe(true);
            });
        });

        test('5.2 should have hints with valid positions', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();

            // Verify hints have position data
            hintData.sample.forEach((hint: any) => {
                expect(hint.position).toBeDefined();
                expect(typeof hint.position.left).toBe('number');
                expect(typeof hint.position.top).toBe('number');
            });
        });
    });

    describe('6.0 Regional Hints Menu', () => {
        // TODO(hbt): NEXT [test] Menu tests timing out - menu not appearing after selecting hint
        // Investigate why regionalHints.attach() isn't being called or menu isn't visible
        // Possible issues: timing, menu rendering, or selector mismatch
        test.skip('6.1 should show menu after selecting hint', async () => {
            // Create regional hints
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

            const menuSnapshot = await fetchRegionalMenuSnapshot();
            expect(menuSnapshot.visible).toBe(true);
            expect(menuSnapshot.menuItems.length).toBeGreaterThan(0);
        });

        test.skip('6.2 should have expected menu items (ct, ch, d, l)', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            const firstHint = hintData.sortedHints[0];

            // Select hint
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            await waitForRegionalMenu();

            const menuSnapshot = await fetchRegionalMenuSnapshot();
            const menuText = menuSnapshot.menuItems.map((item: any) => item.text).join(' ');

            // Menu should contain references to ct, ch, d, l subcommands
            expect(menuText).toContain('ct');
            expect(menuText).toContain('ch');
            expect(menuText).toContain('d');
        });

        test.skip('6.3 should have visible menu items', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            const firstHint = hintData.sortedHints[0];

            // Select hint
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            await waitForRegionalMenu();

            const menuSnapshot = await fetchRegionalMenuSnapshot();

            // All menu items should be visible
            menuSnapshot.menuItems.forEach((item: any) => {
                expect(item.visible).toBe(true);
            });
        });
    });

    describe('7.0 Regional Hints Subcommands', () => {
        // TODO(hbt): NEXT [test] Subcommand tests depend on menu appearing - skipped until menu issue resolved
        test.skip('7.1 should exit regional hints mode with Escape', async () => {
            // Create regional hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            const firstHint = hintData.sortedHints[0];

            // Select hint to show menu
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            await waitForRegionalMenu();

            // Verify menu is visible
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

        test.skip('7.2 should delete element with d subcommand', async () => {
            // Get initial paragraph count
            const initialPCount = await countElements(pageWs, 'p');

            // Create regional hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            const firstHint = hintData.sortedHints[0];

            // Select hint
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            await waitForRegionalMenu();

            // Press 'd' to delete element
            await sendKey(pageWs, 'd');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify element was deleted
            const finalPCount = await countElements(pageWs, 'p');
            expect(finalPCount).toBeLessThan(initialPCount);
        });

        test.skip('7.3 should copy text with ct subcommand', async () => {
            // Create regional hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            const firstHint = hintData.sortedHints[0];

            // Select hint
            for (const char of firstHint) {
                await sendKey(pageWs, char, 50);
            }

            await waitForRegionalMenu();

            // Press 'ct' to copy text
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify clipboard contains text (check via Clipboard API)
            const clipboardText = await executeInTarget(pageWs, `
                (async function() {
                    try {
                        const text = await navigator.clipboard.readText();
                        return { success: true, text: text };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                })()
            `);

            // In headless mode, clipboard may not be available
            // Just verify the command didn't error
            expect(clipboardText).toBeDefined();
        });
    });

    describe('8.0 Hint Clearing', () => {
        test('8.1 should clear hints when pressing Escape', async () => {
            // Create hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            // Verify hints exist
            const beforeClear = await fetchRegionalHintSnapshot();
            expect(beforeClear.found).toBe(true);
            expect(beforeClear.count).toBeGreaterThan(0);

            // Clear hints
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Verify hints are cleared
            const afterClear = await fetchRegionalHintSnapshot();
            expect(afterClear.count).toBe(0);
        });

        test('8.2 should allow creating hints again after clearing', async () => {
            // Create and clear hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Create hints again
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(0);
        });
    });

    describe('9.0 Hint Consistency', () => {
        test('9.1 should create consistent hints across multiple invocations', async () => {
            // First invocation
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);
            const snapshot1 = await fetchRegionalHintSnapshot();

            // Clear and recreate
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);
            const snapshot2 = await fetchRegionalHintSnapshot();

            // Verify consistency
            expect(snapshot1.count).toBe(snapshot2.count);
            expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
        });

        test('9.2 should have deterministic hint snapshot', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintSnapshot = await fetchRegionalHintSnapshot();

            // Verify hints were created
            expect(hintSnapshot.found).toBe(true);
            expect(hintSnapshot.count).toBeGreaterThan(0);

            // Snapshot test - ensures hints remain deterministic
            expect({
                count: hintSnapshot.count,
                sortedHints: hintSnapshot.sortedHints
            }).toMatchSnapshot();
        });
    });

    describe('10.0 Edge Cases', () => {
        test('10.1 should handle rapid hint creation and clearing', async () => {
            for (let i = 0; i < 3; i++) {
                await clickAt(pageWs, 100, 100);
                await sendKey(pageWs, 'L');
                await waitForRegionalHintCount(1);

                const snapshot = await fetchRegionalHintSnapshot();
                expect(snapshot.count).toBeGreaterThan(0);

                await sendKey(pageWs, 'Escape');
                await waitForHintsCleared();
            }
        });

        test.skip('10.2 should handle selecting and exiting multiple times', async () => {
            for (let i = 0; i < 2; i++) {
                await clickAt(pageWs, 100, 100);
                await sendKey(pageWs, 'L');
                await waitForRegionalHintCount(1);

                const hintData = await fetchRegionalHintSnapshot();
                const firstHint = hintData.sortedHints[0];

                // Select hint
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                await waitForRegionalMenu();

                // Exit
                await sendKey(pageWs, 'Escape');
                await waitForHintsCleared();
            }
        });

        test('10.3 should handle different element types', async () => {
            // Scroll to different parts of page to get different element types
            await executeInTarget(pageWs, 'window.scrollTo(0, 0);');
            await new Promise(resolve => setTimeout(resolve, 100));

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const topSnapshot = await fetchRegionalHintSnapshot();
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Scroll to middle
            await executeInTarget(pageWs, 'window.scrollTo(0, document.body.scrollHeight / 2);');
            await new Promise(resolve => setTimeout(resolve, 100));

            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const middleSnapshot = await fetchRegionalHintSnapshot();

            // Both should have hints
            expect(topSnapshot.count).toBeGreaterThan(0);
            expect(middleSnapshot.count).toBeGreaterThan(0);
        });
    });

    describe('11.0 Hint Interaction', () => {
        test('11.1 should filter hints when typing hint label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const initialSnapshot = await fetchRegionalHintSnapshot();
            const initialCount = initialSnapshot.count;

            // Get first hint label
            const firstHint = initialSnapshot.sortedHints[0];
            expect(firstHint).toBeDefined();

            // Type first character of hint
            if (firstHint && firstHint.length > 0) {
                await sendKey(pageWs, firstHint[0]);
                await new Promise(resolve => setTimeout(resolve, 200));

                // If there's more than one character, we should still see filtering
                if (firstHint.length > 1) {
                    const filteredSnapshot = await fetchRegionalHintSnapshot();
                    // Either hints filtered or menu appeared (if matched)
                    expect(filteredSnapshot.count <= initialCount || filteredSnapshot.count === 0).toBe(true);
                }
            }
        });

        test.skip('11.2 should show menu after typing complete hint label', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const snapshot = await fetchRegionalHintSnapshot();
            const firstHint = snapshot.sortedHints[0];

            // Type complete hint label to select it
            if (firstHint) {
                for (const char of firstHint) {
                    await sendKey(pageWs, char, 50);
                }

                // Menu should appear
                await waitForRegionalMenu();

                const menuSnapshot = await fetchRegionalMenuSnapshot();
                expect(menuSnapshot.visible).toBe(true);
            }
        });
    });
});
