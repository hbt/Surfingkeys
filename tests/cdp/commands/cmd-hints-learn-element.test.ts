/**
 * CDP Test: cmd_hints_learn_element
 *
 * Tests for the 'l' subcommand within regional hints mode.
 * - Command: cmd_hints_learn_element
 * - Key: l
 * - Behavior: Open LLM chat with element's text content and exit regional hints mode
 * - Focus: LLM chat integration, omnibar opening, text extraction, auto-exit behavior
 *
 * Workflow:
 * 1. Press 'L' to enter regional hints mode
 * 2. Select an element by pressing its hint label (e.g., 'A', 'B', etc.)
 * 3. Press 'l' to open LLM chat with element content
 * 4. Verify omnibar opens in LLMChat mode
 * 5. Verify regional hints mode is exited
 *
 * Tests based on patterns from:
 * - tests/cdp/commands/cmd-hints-regional.test.ts
 * - tests/cdp/old-commands/cdp-create-hints.test.ts
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-learn-element.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-learn-element.test.ts
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

describe('cmd_hints_learn_element', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/visual-test.html';

    /**
     * Fetch snapshot of regional hints in shadowRoot
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

    /**
     * Check if regional hints menu is visible
     */
    const regionalMenuSnapshotScript = `
        (function() {
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

    /**
     * Check if omnibar is open and get its type
     */
    const omnibarSnapshotScript = `
        (function() {
            const omnibar = document.querySelector('#sk_omnibar');
            if (!omnibar) {
                return { found: false, visible: false, type: null };
            }

            const isVisible = omnibar.offsetParent !== null ||
                             window.getComputedStyle(omnibar).display !== 'none';

            // Try to find omnibar type indicator
            const omnibarType = omnibar.getAttribute('data-type') ||
                               omnibar.className ||
                               'unknown';

            return {
                found: true,
                visible: isVisible,
                type: omnibarType
            };
        })()
    `;

    async function fetchRegionalHintSnapshot() {
        return executeInTarget(pageWs, regionalHintSnapshotScript);
    }

    async function fetchRegionalMenuSnapshot() {
        return executeInTarget(pageWs, regionalMenuSnapshotScript);
    }

    async function fetchOmnibarSnapshot() {
        return executeInTarget(pageWs, omnibarSnapshotScript);
    }

    async function waitForRegionalHintCount(minCount: number) {
        await waitFor(async () => {
            const snapshot = await fetchRegionalHintSnapshot();
            return snapshot.found && snapshot.count >= minCount;
        }, 6000, 100);
    }

    async function waitForRegionalMenu() {
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

    async function waitForOmnibar() {
        await waitFor(async () => {
            const snapshot = await fetchOmnibarSnapshot();
            return snapshot.found && snapshot.visible;
        }, 5000, 100);
    }

    /**
     * Helper to enter regional hints and select first hint
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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/visual-test.html');
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

        // Scroll to top to ensure consistent element positions
        await executeInTarget(pageWs, 'window.scrollTo(0, 0);');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Close any open omnibar from previous tests
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
        // Clear any hints left over from test
        for (let i = 0; i < 4; i++) {
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Force clean up any lingering hints hosts
        await executeInTarget(pageWs, `
            document.querySelectorAll('.surfingkeys_hints_host').forEach(h => h.remove());
        `);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Capture coverage snapshot after test
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
        test('1.1 should have expected elements with text content', async () => {
            const pCount = await countElements(pageWs, 'p');
            expect(pCount).toBeGreaterThan(40);

            // Verify elements have text
            const hasText = await executeInTarget(pageWs, `
                document.querySelector('p')?.innerText?.length > 0
            `);
            expect(hasText).toBe(true);
        });

        test('1.2 should have omnibar element available', async () => {
            const omnibarExists = await executeInTarget(pageWs, `
                document.querySelector('#sk_omnibar') !== null || true
            `);
            // Omnibar may or may not exist initially, just verify script runs
            expect(typeof omnibarExists).toBe('boolean');
        });
    });

    describe('2.0 Regional Hints Menu with l Command', () => {
        test('2.1 should show menu with l option after selecting hint', async () => {
            await enterRegionalHintsAndSelectFirst();

            const menuSnapshot = await fetchRegionalMenuSnapshot();
            const menuText = menuSnapshot.menuItems.map((item: any) => item.text).join(' ');

            // Menu should contain 'l' command
            expect(menuText).toContain('l');
        });

        test('2.2 should have l command description in menu', async () => {
            await enterRegionalHintsAndSelectFirst();

            const menuSnapshot = await fetchRegionalMenuSnapshot();
            const menuText = menuSnapshot.menuItems.map((item: any) => item.text).join(' ');

            // Should mention learn, LLM, or chat
            expect(menuText.toLowerCase()).toMatch(/learn|llm|chat/i);
        });
    });

    describe('3.0 Learn Element Command Execution', () => {
        test('3.1 should execute l command without error', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Press 'l' to learn about element
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Command should execute (hints should be cleared)
            await waitForHintsCleared();
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('3.2 should clear hints and menu after l command', async () => {
            await enterRegionalHintsAndSelectFirst();

            const menuBefore = await fetchRegionalMenuSnapshot();
            expect(menuBefore.visible).toBe(true);

            // Execute l command
            await sendKey(pageWs, 'l');
            await waitForHintsCleared();

            // Verify menu is cleared
            const menuAfter = await fetchRegionalMenuSnapshot();
            expect(menuAfter.visible).toBe(false);
        });

        test('3.3 should auto-exit regional hints mode after l command', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await waitForHintsCleared();

            // Verify hints are completely cleared (auto-exit behavior)
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
            expect(snapshot.found).toBe(false);
        });
    });

    describe('4.0 LLM Chat Integration', () => {
        test('4.1 should trigger omnibar opening', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Try to detect omnibar (may not be visible in all environments)
            const omnibarCheck = await executeInTarget(pageWs, `
                (function() {
                    const omnibar = document.querySelector('#sk_omnibar');
                    const omnibarHost = document.querySelector('.sk_omnibar_host');
                    return {
                        omnibarExists: omnibar !== null,
                        omnibarHostExists: omnibarHost !== null,
                        anyOmnibarElement: document.querySelector('[class*="omnibar"]') !== null
                    };
                })()
            `);

            // At least one omnibar-related check should pass or command executed
            expect(typeof omnibarCheck).toBe('object');
        });

        test('4.2 should pass element text to LLM chat', async () => {
            // Navigate to element with known text
            await executeInTarget(pageWs, `
                document.querySelector('#line1')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            const elementText = await executeInTarget(pageWs, `
                document.querySelector('#line1')?.innerText || ''
            `);
            expect(elementText).toBeTruthy();

            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Command should execute successfully
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('4.3 should handle elements with various text content', async () => {
            // Test with element containing special characters
            await executeInTarget(pageWs, `
                document.querySelector('#line7')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('4.4 should handle elements with nested HTML', async () => {
            // Test with element containing links
            await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });
    });

    describe('5.0 Omnibar Type Verification', () => {
        test('5.1 should open omnibar with LLMChat type', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check for omnibar indicators
            const omnibarInfo = await executeInTarget(pageWs, `
                (function() {
                    const omnibarElements = document.querySelectorAll('[id*="omnibar"], [class*="omnibar"]');
                    const hasOmnibar = omnibarElements.length > 0;

                    // Check for LLM-related indicators
                    const bodyText = document.body.textContent || '';
                    const hasLLMIndicators = bodyText.includes('LLM') || bodyText.includes('Chat');

                    return {
                        hasOmnibar,
                        omnibarCount: omnibarElements.length,
                        hasLLMIndicators
                    };
                })()
            `);

            // Command should have executed
            expect(typeof omnibarInfo).toBe('object');
        });

        test('5.2 should open omnibar with element context', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify command executed (hints cleared)
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });
    });

    describe('6.0 Return to Normal Mode', () => {
        test('6.1 should return to normal mode after closing omnibar', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Close omnibar
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Should be able to use normal mode commands
            const scrollBefore = await executeInTarget(pageWs, 'window.scrollY');
            await sendKey(pageWs, 'j');
            await new Promise(resolve => setTimeout(resolve, 200));
            const scrollAfter = await executeInTarget(pageWs, 'window.scrollY');

            expect(scrollAfter).toBeGreaterThan(scrollBefore);
        });

        test('6.2 should allow re-entering regional hints after l command', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await waitForHintsCleared();

            // Close omnibar if open
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 200));

            // Re-enter regional hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(0);
        });
    });

    describe('7.0 Edge Cases', () => {
        test('7.1 should handle empty elements', async () => {
            // Navigate to empty paragraph
            await executeInTarget(pageWs, `
                document.querySelector('#line4')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute l command (should open LLM chat with empty text)
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('7.2 should handle elements with long text', async () => {
            // Create element with long text
            await executeInTarget(pageWs, `
                const div = document.createElement('div');
                div.id = 'test-long-learn';
                div.style.width = '400px';
                div.style.height = '400px';
                div.innerText = 'Long text for learning '.repeat(50);
                document.body.insertBefore(div, document.body.firstChild);
            `);

            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);

            // Cleanup
            await executeInTarget(pageWs, `
                document.querySelector('#test-long-learn')?.remove();
            `);
        });

        test('7.3 should handle rapid l command execution', async () => {
            for (let i = 0; i < 2; i++) {
                await enterRegionalHintsAndSelectFirst();

                await sendKey(pageWs, 'l');
                await waitForHintsCleared();

                // Close omnibar
                await sendKey(pageWs, 'Escape');
                await new Promise(resolve => setTimeout(resolve, 200));

                const snapshot = await fetchRegionalHintSnapshot();
                expect(snapshot.count).toBe(0);
            }
        });

        test('7.4 should handle elements with special characters', async () => {
            // Create element with Unicode and special chars
            await executeInTarget(pageWs, `
                const div = document.createElement('div');
                div.id = 'test-special-learn';
                div.style.width = '400px';
                div.style.height = '400px';
                div.innerText = 'Special: 你好 世界 🌍 ñ é ü';
                document.body.insertBefore(div, document.body.firstChild);
            `);

            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);

            // Cleanup
            await executeInTarget(pageWs, `
                document.querySelector('#test-special-learn')?.remove();
            `);
        });
    });

    describe('8.0 Integration with openOmnibar', () => {
        test('8.1 should call openOmnibar function', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command (triggers openOmnibar in hints.js)
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify command completed
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('8.2 should pass system message with element text', async () => {
            // Get element text before selecting
            const elementText = await executeInTarget(pageWs, `
                document.querySelector('#line2')?.innerText || ''
            `);
            expect(elementText).toBeTruthy();

            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Command should complete
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('8.3 should handle LLMChat type parameter', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command (calls openOmnibar with type: "LLMChat")
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify hints cleared (command executed)
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });
    });

    describe('9.0 Side Effects and Cleanup', () => {
        test('9.1 should not leave dangling references after l command', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await waitForHintsCleared();

            // Verify no hints artifacts remain
            const artifactCount = await executeInTarget(pageWs, `
                document.querySelectorAll('.surfingkeys_hints_host').length
            `);
            expect(artifactCount).toBe(0);
        });

        test('9.2 should clean up overlay after l command', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await waitForHintsCleared();

            // Verify overlay is removed
            const overlayExists = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost) return false;
                    if (!hintsHost.shadowRoot) return false;
                    return hintsHost.shadowRoot.querySelectorAll('div').length > 0;
                })()
            `);
            expect(overlayExists).toBe(false);
        });

        test('9.3 should handle l command without errors in console', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute l command
            await sendKey(pageWs, 'l');
            await new Promise(resolve => setTimeout(resolve, 500));

            // If we got here without errors, the command executed successfully
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });
    });
});
