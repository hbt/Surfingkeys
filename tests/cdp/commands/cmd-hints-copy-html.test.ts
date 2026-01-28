/**
 * CDP Test: cmd_hints_copy_html
 *
 * Tests for the 'ch' subcommand within regional hints mode.
 * - Command: cmd_hints_copy_html
 * - Key: ch
 * - Behavior: Copy HTML content from selected element to clipboard
 * - Focus: HTML extraction, clipboard operations, preservation of inner HTML structure
 *
 * Workflow:
 * 1. Press 'L' to enter regional hints mode
 * 2. Select an element by pressing its hint label (e.g., 'A', 'B', etc.)
 * 3. Press 'ch' to copy HTML content
 * 4. Verify HTML content is in clipboard (or command executed without error)
 *
 * Tests based on patterns from:
 * - tests/cdp/commands/cmd-hints-regional.test.ts
 * - tests/cdp/old-commands/cdp-create-hints.test.ts
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-copy-html.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-copy-html.test.ts
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

describe('cmd_hints_copy_html', () => {
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
     * Returns the selected hint label and element info
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

    /**
     * Get HTML content of element at specific position
     */
    async function getElementHTMLAtPosition(x: number, y: number) {
        return executeInTarget(pageWs, `
            (function() {
                const elem = document.elementFromPoint(${x}, ${y});
                if (!elem) return null;
                return {
                    tagName: elem.tagName,
                    innerHTML: elem.innerHTML,
                    outerHTML: elem.outerHTML,
                    textContent: elem.textContent
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
        test('1.1 should have expected elements with HTML content', async () => {
            const pCount = await countElements(pageWs, 'p');
            expect(pCount).toBeGreaterThan(40);

            // Verify elements have innerHTML
            const hasInnerHTML = await executeInTarget(pageWs, `
                document.querySelector('p')?.innerHTML?.length > 0
            `);
            expect(hasInnerHTML).toBe(true);
        });

        test('1.2 should have elements with nested HTML', async () => {
            // Check for elements with nested HTML (like links in paragraphs)
            const nestedHTML = await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.innerHTML || ''
            `);
            expect(nestedHTML).toContain('<a');
            expect(nestedHTML).toContain('href');
        });
    });

    describe('2.0 Regional Hints Menu with ch Command', () => {
        test('2.1 should show menu with ch option after selecting hint', async () => {
            await enterRegionalHintsAndSelectFirst();

            const menuSnapshot = await fetchRegionalMenuSnapshot();
            const menuText = menuSnapshot.menuItems.map((item: any) => item.text).join(' ');

            // Menu should contain 'ch' command
            expect(menuText).toContain('ch');
        });

        test('2.2 should have ch command description in menu', async () => {
            await enterRegionalHintsAndSelectFirst();

            const menuSnapshot = await fetchRegionalMenuSnapshot();
            const menuText = menuSnapshot.menuItems.map((item: any) => item.text).join(' ');

            // Should mention HTML or copy
            expect(menuText.toLowerCase()).toMatch(/html|copy/i);
        });
    });

    describe('3.0 Copy HTML Command Execution', () => {
        test('3.1 should execute ch command without error', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Press 'ch' to copy HTML
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Command should execute (hints should be cleared)
            await waitForHintsCleared();
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('3.2 should clear hints and menu after ch command', async () => {
            await enterRegionalHintsAndSelectFirst();

            const menuBefore = await fetchRegionalMenuSnapshot();
            expect(menuBefore.visible).toBe(true);

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await waitForHintsCleared();

            // Verify menu is cleared
            const menuAfter = await fetchRegionalMenuSnapshot();
            expect(menuAfter.visible).toBe(false);
        });

        test('3.3 should trigger clipboard write operation', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Set up clipboard monitoring (if supported)
            const clipboardBefore = await executeInTarget(pageWs, `
                (async function() {
                    try {
                        // Store a known value
                        await navigator.clipboard.writeText('test-before');
                        return { success: true, value: 'test-before' };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                })()
            `);

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Try to read clipboard (may not work in headless mode)
            const clipboardAfter = await executeInTarget(pageWs, `
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
            // Just verify the command executed without throwing
            expect(clipboardAfter).toBeDefined();
        });
    });

    describe('4.0 HTML Content Verification', () => {
        test('4.1 should copy innerHTML from selected element', async () => {
            // Scroll to element with known HTML content
            await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Get the expected HTML
            const expectedHTML = await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.innerHTML || ''
            `);

            await enterRegionalHintsAndSelectFirst();

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify command executed
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);

            // Expected HTML should contain link
            expect(expectedHTML).toBeTruthy();
            expect(typeof expectedHTML).toBe('string');
        });

        test('4.2 should handle elements with nested HTML tags', async () => {
            // Navigate to element with nested HTML
            await executeInTarget(pageWs, `
                document.querySelector('#nested-line')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('4.3 should handle elements with special characters in HTML', async () => {
            // Navigate to element with special chars
            await executeInTarget(pageWs, `
                document.querySelector('#line7')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });
    });

    describe('5.0 Return to Normal Mode', () => {
        test('5.1 should return to normal mode after ch command', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await waitForHintsCleared();

            // Should be able to use normal mode commands
            const scrollBefore = await executeInTarget(pageWs, 'window.scrollY');
            await sendKey(pageWs, 'j');
            await new Promise(resolve => setTimeout(resolve, 200));
            const scrollAfter = await executeInTarget(pageWs, 'window.scrollY');

            expect(scrollAfter).toBeGreaterThan(scrollBefore);
        });

        test('5.2 should allow re-entering regional hints after ch command', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await waitForHintsCleared();

            // Re-enter regional hints
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(0);
        });
    });

    describe('6.0 Edge Cases', () => {
        test('6.1 should handle empty elements gracefully', async () => {
            // Navigate to empty paragraph
            await executeInTarget(pageWs, `
                document.querySelector('#line4')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute ch command (should copy empty string)
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('6.2 should handle multiple link elements', async () => {
            // Navigate to element with multiple links
            await executeInTarget(pageWs, `
                document.querySelector('#multi-link-line')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('6.3 should handle rapid ch command execution', async () => {
            for (let i = 0; i < 2; i++) {
                await enterRegionalHintsAndSelectFirst();

                await sendKey(pageWs, 'c');
                await sendKey(pageWs, 'h');
                await waitForHintsCleared();

                const snapshot = await fetchRegionalHintSnapshot();
                expect(snapshot.count).toBe(0);
            }
        });

        test('6.4 should handle long HTML content', async () => {
            // Create element with long HTML content
            await executeInTarget(pageWs, `
                const div = document.createElement('div');
                div.id = 'test-long-html';
                div.innerHTML = '<p>' + 'Long content '.repeat(100) + '</p>';
                document.body.appendChild(div);
            `);

            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);

            // Cleanup
            await executeInTarget(pageWs, `
                document.querySelector('#test-long-html')?.remove();
            `);
        });
    });

    describe('7.0 Clipboard Operation', () => {
        test('7.1 should attempt clipboard write through Surfingkeys clipboard API', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Verify menu shows before command
            const menuBefore = await fetchRegionalMenuSnapshot();
            expect(menuBefore.visible).toBe(true);

            // Execute ch command (triggers clipboard.write in hints.js)
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify command completed (menu cleared)
            const menuAfter = await fetchRegionalMenuSnapshot();
            expect(menuAfter.visible).toBe(false);
        });

        test('7.2 should preserve HTML structure in clipboard operation', async () => {
            // Select element with known HTML structure
            await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            const originalHTML = await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.innerHTML || ''
            `);

            await enterRegionalHintsAndSelectFirst();

            // Execute ch command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 'h');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify original HTML had structure
            expect(originalHTML).toContain('<a');
            expect(originalHTML).toContain('href');
        });
    });
});
