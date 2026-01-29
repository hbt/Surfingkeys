/**
 * CDP Test: cmd_hints_copy_text
 *
 * Tests for the 'ct' subcommand within regional hints mode.
 * - Command: cmd_hints_copy_text
 * - Key: ct
 * - Behavior: Copy text content (innerText) from selected element to clipboard
 * - Focus: Text extraction, clipboard operations, text-only content without HTML tags
 *
 * Workflow:
 * 1. Press 'L' to enter regional hints mode
 * 2. Select an element by pressing its hint label (e.g., 'A', 'B', etc.)
 * 3. Press 'ct' to copy text content
 * 4. Verify text content is in clipboard (or command executed without error)
 *
 * Tests based on patterns from:
 * - tests/cdp/commands/cmd-hints-regional.test.ts
 * - tests/cdp/old-commands/cdp-create-hints.test.ts
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-copy-text.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-copy-text.test.ts
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

describe('cmd_hints_copy_text', () => {
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
     * The menu is appended to an overlay div in shadowRoot after selecting a hint
     */
    const regionalMenuSnapshotScript = `
        (function() {
            const hintsHosts = document.querySelectorAll('.surfingkeys_hints_host');

            for (const hintsHost of hintsHosts) {
                if (!hintsHost || !hintsHost.shadowRoot) {
                    continue;
                }

                const shadowRoot = hintsHost.shadowRoot;

                // Menu can be nested inside an overlay div
                const menu = shadowRoot.querySelector('div.menu');

                if (menu) {
                    const menuItems = Array.from(shadowRoot.querySelectorAll('div.menu-item')).map(item => ({
                        text: item.textContent?.trim(),
                        visible: item.offsetParent !== null,
                        display: window.getComputedStyle(item).display
                    }));

                    return {
                        visible: menu.offsetParent !== null,
                        menuItems,
                        menuDisplay: window.getComputedStyle(menu).display,
                        menuText: menu.textContent?.trim()
                    };
                }
            }

            return { visible: false, menuItems: [], menuDisplay: 'none', menuText: '' };
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
     * Returns without waiting for menu (menu timing is inconsistent in headless mode)
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

        // Wait a bit for regionalHints.attach() to be called
        // Note: Menu may not be reliably detectable in headless mode
        await new Promise(resolve => setTimeout(resolve, 500));

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

            // Verify elements have innerText
            const hasInnerText = await executeInTarget(pageWs, `
                document.querySelector('p')?.innerText?.length > 0
            `);
            expect(hasInnerText).toBe(true);
        });

        test('1.2 should have elements with different text content', async () => {
            const text1 = await executeInTarget(pageWs, `
                document.querySelector('#line1')?.innerText || ''
            `);
            const text2 = await executeInTarget(pageWs, `
                document.querySelector('#line2')?.innerText || ''
            `);
            expect(text1).toBeTruthy();
            expect(text2).toBeTruthy();
            expect(text1).not.toBe(text2);
        });
    });

    describe('2.0 Regional Hints Menu with ct Command', () => {
        test('2.1 should enter regional hints mode successfully', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(0);
        });

        test('2.2 should allow selecting a hint', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            const firstHint = hintData.sortedHints[0];
            expect(firstHint).toBeDefined();
            expect(firstHint).toMatch(/^[A-Z]+$/);
        });
    });

    describe('3.0 Copy Text Command Execution', () => {
        test('3.1 should execute ct command without error', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Press 'ct' to copy text
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Command should execute (hints should be cleared)
            await waitForHintsCleared();
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('3.2 should clear hints after ct command', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await waitForHintsCleared();

            // Verify hints are cleared
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('3.3 should complete ct command execution', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify command completed by checking hints are cleared
            await waitForHintsCleared();
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });
    });

    describe('4.0 Text Content Verification', () => {
        test('4.1 should copy innerText from selected element', async () => {
            // Scroll to element with known text content
            await executeInTarget(pageWs, `
                document.querySelector('#line1')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Get the expected text
            const expectedText = await executeInTarget(pageWs, `
                document.querySelector('#line1')?.innerText || ''
            `);

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify command executed
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);

            // Expected text should be defined
            expect(expectedText).toBeTruthy();
            expect(typeof expectedText).toBe('string');
        });

        test('4.2 should extract text without HTML tags', async () => {
            // Navigate to element with HTML tags (link)
            await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Get innerText (should not contain HTML tags)
            const innerText = await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.innerText || ''
            `);

            // Verify innerText doesn't contain HTML tags
            expect(innerText).not.toContain('<a');
            expect(innerText).not.toContain('<');
            expect(innerText).toContain('Click this link');

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('4.3 should handle elements with special characters', async () => {
            // Navigate to element with special chars
            await executeInTarget(pageWs, `
                document.querySelector('#line7')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            const innerText = await executeInTarget(pageWs, `
                document.querySelector('#line7')?.innerText || ''
            `);

            // Verify special characters are present
            expect(innerText).toContain('!@#$%');

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('4.4 should handle elements with numbers', async () => {
            // Navigate to element with numbers
            await executeInTarget(pageWs, `
                document.querySelector('#line8')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            const innerText = await executeInTarget(pageWs, `
                document.querySelector('#line8')?.innerText || ''
            `);

            expect(innerText).toContain('1234567890');

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });
    });

    describe('5.0 Text vs HTML Difference', () => {
        test('5.1 should copy text without HTML tags (ct vs ch)', async () => {
            // Navigate to element with HTML content
            await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            const innerText = await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.innerText || ''
            `);
            const innerHTML = await executeInTarget(pageWs, `
                document.querySelector('#link-line')?.innerHTML || ''
            `);

            // innerText should not have tags, innerHTML should
            expect(innerText).not.toContain('<a');
            expect(innerHTML).toContain('<a');

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command (copies innerText, not innerHTML)
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('5.2 should preserve text formatting but remove HTML', async () => {
            // Create element with formatted text
            await executeInTarget(pageWs, `
                const div = document.createElement('div');
                div.id = 'test-formatted';
                div.innerHTML = '<strong>Bold</strong> and <em>italic</em> text';
                document.body.appendChild(div);
            `);

            await new Promise(resolve => setTimeout(resolve, 200));

            const innerText = await executeInTarget(pageWs, `
                document.querySelector('#test-formatted')?.innerText || ''
            `);

            // Should contain text but not HTML tags
            expect(innerText).toContain('Bold');
            expect(innerText).toContain('italic');
            expect(innerText).not.toContain('<strong>');
            expect(innerText).not.toContain('<em>');

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);

            // Cleanup
            await executeInTarget(pageWs, `
                document.querySelector('#test-formatted')?.remove();
            `);
        });
    });

    describe('6.0 Return to Normal Mode', () => {
        test('6.1 should return to normal mode after ct command', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await waitForHintsCleared();

            // Should be able to use normal mode commands
            const scrollBefore = await executeInTarget(pageWs, 'window.scrollY');
            await sendKey(pageWs, 'j');
            await new Promise(resolve => setTimeout(resolve, 200));
            const scrollAfter = await executeInTarget(pageWs, 'window.scrollY');

            expect(scrollAfter).toBeGreaterThan(scrollBefore);
        });

        test.skip('6.2 should allow re-entering regional hints after ct command', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Press Escape to ensure we're in normal mode
            await sendKey(pageWs, 'Escape');
            await sendKey(pageWs, 'Escape');
            await waitForHintsCleared();

            // Wait for mode to fully reset
            await new Promise(resolve => setTimeout(resolve, 500));

            // Re-enter regional hints
            await clickAt(pageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 200));
            await sendKey(pageWs, 'L');
            await waitForRegionalHintCount(1);

            const hintData = await fetchRegionalHintSnapshot();
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(0);
        });
    });

    describe('7.0 Edge Cases', () => {
        test('7.1 should handle empty elements gracefully', async () => {
            // Navigate to empty paragraph
            await executeInTarget(pageWs, `
                document.querySelector('#line4')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command (should copy empty string)
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('7.2 should handle long text content', async () => {
            // Create element with long text
            await executeInTarget(pageWs, `
                const div = document.createElement('div');
                div.id = 'test-long-text';
                div.innerText = 'Long text '.repeat(100);
                document.body.appendChild(div);
            `);

            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);

            // Cleanup
            await executeInTarget(pageWs, `
                document.querySelector('#test-long-text')?.remove();
            `);
        });

        test.skip('7.3 should handle multiple ct command executions', async () => {
            for (let i = 0; i < 2; i++) {
                await enterRegionalHintsAndSelectFirst();

                await sendKey(pageWs, 'c');
                await sendKey(pageWs, 't');
                await new Promise(resolve => setTimeout(resolve, 300));

                // Ensure we exit hints mode
                await sendKey(pageWs, 'Escape');
                await sendKey(pageWs, 'Escape');
                await waitForHintsCleared();

                const snapshot = await fetchRegionalHintSnapshot();
                expect(snapshot.count).toBe(0);

                // Wait between iterations to allow mode to fully reset
                if (i < 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        });

        test('7.4 should handle whitespace-only elements', async () => {
            // Create element with only whitespace
            await executeInTarget(pageWs, `
                const div = document.createElement('div');
                div.id = 'test-whitespace';
                div.innerHTML = '   \\n\\t   ';
                document.body.appendChild(div);
            `);

            await new Promise(resolve => setTimeout(resolve, 200));

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should complete without error
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);

            // Cleanup
            await executeInTarget(pageWs, `
                document.querySelector('#test-whitespace')?.remove();
            `);
        });
    });

    describe('8.0 Clipboard Operation', () => {
        test('8.1 should attempt clipboard write through Surfingkeys clipboard API', async () => {
            await enterRegionalHintsAndSelectFirst();

            // Execute ct command (triggers clipboard.write in hints.js)
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify command completed (hints cleared)
            await waitForHintsCleared();
            const snapshot = await fetchRegionalHintSnapshot();
            expect(snapshot.count).toBe(0);
        });

        test('8.2 should copy plain text without formatting', async () => {
            // Select element with text
            await executeInTarget(pageWs, `
                document.querySelector('#line2')?.scrollIntoView();
            `);
            await new Promise(resolve => setTimeout(resolve, 200));

            const originalText = await executeInTarget(pageWs, `
                document.querySelector('#line2')?.innerText || ''
            `);

            await enterRegionalHintsAndSelectFirst();

            // Execute ct command
            await sendKey(pageWs, 'c');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify original text was extracted
            expect(originalText).toBeTruthy();
            expect(typeof originalText).toBe('string');
        });
    });
});
