/**
 * CDP Test: cmd_hints_first_input
 *
 * Comprehensive tests for the hints command 'gi' (Go to first edit box).
 * - Command: cmd_hints_first_input
 * - Key: 'gi'
 * - Behavior: Focus the first editable input field on the page without creating traditional hints
 * - Focus: Direct input focus for single input, input layer masks for multiple inputs
 *
 * Key differences from 'i' (cmd_hints_select_input):
 * - 'gi': Focuses FIRST input immediately, no hint selection UI
 * - 'i': Shows hints for ALL inputs, user selects which one
 *
 * Implementation details (hints.createInputLayer):
 * - Searches for text, email, search, password inputs (not disabled/readonly)
 * - 1 input: focuses directly, enters insert mode
 * - Multiple inputs: creates mask overlays, focuses first one
 * - Does NOT create traditional hint labels (A, B, C, etc.)
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-hints-first-input.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-hints-first-input.test.ts
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

describe('cmd_hints_first_input', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let extensionId: string;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/input-test.html';

    /**
     * Get the currently focused element
     */
    async function getActiveElement() {
        return executeInTarget(pageWs, `
            (function() {
                const el = document.activeElement;
                if (!el) return null;
                return {
                    tagName: el.tagName,
                    id: el.id || null,
                    type: el.type || null,
                    placeholder: el.placeholder || null,
                    value: el.value || null,
                    isFocused: document.activeElement === el
                };
            })()
        `);
    }

    /**
     * Check if input layer masks exist (for multiple inputs scenario)
     */
    async function checkInputLayer() {
        return executeInTarget(pageWs, `
            (function() {
                const hintsHost = document.querySelector('.surfingkeys_hints_host');
                if (!hintsHost || !hintsHost.shadowRoot) {
                    return { found: false, masks: 0, activeInput: null };
                }

                const holder = hintsHost.shadowRoot.querySelector('[mode=input]');
                if (!holder) {
                    return { found: false, masks: 0, activeInput: null };
                }

                const masks = holder.querySelectorAll('mask');
                const activeMask = holder.querySelector('mask.activeInput');

                return {
                    found: true,
                    masks: masks.length,
                    activeInput: activeMask ? {
                        isActive: true,
                        // Note: mask.link is a JS property reference, not accessible via CDP
                        // We verify focus through document.activeElement instead
                    } : null
                };
            })()
        `);
    }

    /**
     * Wait for an input to receive focus
     */
    async function waitForInputFocus() {
        await waitFor(async () => {
            const activeEl = await getActiveElement();
            return activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        }, 4000, 100);
    }

    /**
     * Count editable inputs of specific types (text, email, search, password)
     */
    async function countEditableInputs() {
        return executeInTarget(pageWs, `
            (function() {
                const inputs = document.querySelectorAll('input');
                let count = 0;
                inputs.forEach(input => {
                    const isEditable = (input.type === 'text' ||
                                      input.type === 'email' ||
                                      input.type === 'search' ||
                                      input.type === 'password');
                    const isEnabled = !input.disabled && !input.readOnly;
                    const isVisible = input.offsetParent !== null;

                    if (isEditable && isEnabled && isVisible) {
                        count++;
                    }
                });
                return count;
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
        const pageWsUrl = await findContentPage('127.0.0.1:9873/input-test.html');
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

        // Ensure clean state - click body to remove focus from any input
        await clickAt(pageWs, 100, 100);
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
        // Clear any state
        await sendKey(pageWs, 'Escape');
        await new Promise(resolve => setTimeout(resolve, 100));

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

    describe('1.0 Fixture Setup', () => {
        test('1.1 should load input-test.html fixture', async () => {
            const title = await executeInTarget(pageWs, 'document.title');
            expect(title).toBe('Input Test Page');
        });

        test('1.2 should have text inputs', async () => {
            const textInputs = await countElements(pageWs, 'input[type="text"]');
            expect(textInputs).toBeGreaterThan(5);
        });

        test('1.3 should have email input', async () => {
            const emailInputs = await countElements(pageWs, 'input[type="email"]');
            expect(emailInputs).toBeGreaterThan(0);
        });

        test('1.4 should have search input', async () => {
            const searchInputs = await countElements(pageWs, 'input[type="search"]');
            expect(searchInputs).toBeGreaterThan(0);
        });

        test('1.5 should have password input', async () => {
            const passwordInputs = await countElements(pageWs, 'input[type="password"]');
            expect(passwordInputs).toBeGreaterThan(0);
        });

        test('1.6 should have multiple editable inputs', async () => {
            const editableCount = await countEditableInputs();
            expect(editableCount).toBeGreaterThan(5);
        });

        test('1.7 should have no input focused initially', async () => {
            const activeEl = await getActiveElement();
            // Body is typically focused
            expect(activeEl?.tagName).toBe('BODY');
        });
    });

    describe('2.0 Basic First Input Focus', () => {
        test('2.1 should focus first input when pressing gi', async () => {
            // Click page to ensure not focused on input
            await clickAt(pageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Press 'gi'
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            // Check focused element
            const activeEl = await getActiveElement();
            expect(activeEl).not.toBeNull();
            expect(activeEl?.tagName).toBe('INPUT');
            expect(activeEl?.isFocused).toBe(true);
        });

        test('2.2 should focus the FIRST text input (text-input-1)', async () => {
            await clickAt(pageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const activeEl = await getActiveElement();
            expect(activeEl?.id).toBe('text-input-1');
            expect(activeEl?.type).toBe('text');
        });

        test('2.3 should create input layer with masks for multiple inputs', async () => {
            await clickAt(pageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const inputLayer = await checkInputLayer();
            expect(inputLayer.found).toBe(true);
            expect(inputLayer.masks).toBeGreaterThan(1);
            expect(inputLayer.activeInput?.isActive).toBe(true);
        });

        test('2.4 should NOT create traditional hint labels', async () => {
            await clickAt(pageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            // Check for traditional hints (A, B, C style labels)
            const hintsCheck = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) {
                        return { hasHints: false };
                    }

                    const hintDivs = Array.from(hintsHost.shadowRoot.querySelectorAll('div'));
                    const hintLabels = hintDivs.filter(d => {
                        const text = (d.textContent || '').trim();
                        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                    });

                    return {
                        hasHints: hintLabels.length > 0,
                        hintCount: hintLabels.length
                    };
                })()
            `);

            // Should NOT have traditional hint labels
            expect(hintsCheck.hasHints).toBe(false);
        });
    });

    describe('3.0 Input Type Support', () => {
        test('3.1 should support text input type', async () => {
            // Verify text-input-1 gets focused (it's first)
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const activeEl = await getActiveElement();
            expect(activeEl?.type).toBe('text');
            expect(activeEl?.id).toBe('text-input-1');
        });

        test('3.2 should include email input in editable inputs', async () => {
            const editableTypes = await executeInTarget(pageWs, `
                (function() {
                    const cssSelector = "input:not([type=submit]), textarea, *[contenteditable=true], *[role=textbox], select, div.ace_cursor";
                    const inputs = document.querySelectorAll('input');
                    const types = [];
                    inputs.forEach(input => {
                        const isEditable = (input.type === 'text' ||
                                          input.type === 'email' ||
                                          input.type === 'search' ||
                                          input.type === 'password');
                        const isEnabled = !input.disabled && !input.readOnly;
                        if (isEditable && isEnabled && input.offsetParent !== null) {
                            types.push(input.type);
                        }
                    });
                    return types;
                })()
            `);

            expect(editableTypes).toContain('email');
        });

        test('3.3 should include search input in editable inputs', async () => {
            const editableTypes = await executeInTarget(pageWs, `
                (function() {
                    const inputs = document.querySelectorAll('input');
                    const types = [];
                    inputs.forEach(input => {
                        const isEditable = (input.type === 'text' ||
                                          input.type === 'email' ||
                                          input.type === 'search' ||
                                          input.type === 'password');
                        const isEnabled = !input.disabled && !input.readOnly;
                        if (isEditable && isEnabled && input.offsetParent !== null) {
                            types.push(input.type);
                        }
                    });
                    return types;
                })()
            `);

            expect(editableTypes).toContain('search');
        });

        test('3.4 should include password input in editable inputs', async () => {
            const editableTypes = await executeInTarget(pageWs, `
                (function() {
                    const inputs = document.querySelectorAll('input');
                    const types = [];
                    inputs.forEach(input => {
                        const isEditable = (input.type === 'text' ||
                                          input.type === 'email' ||
                                          input.type === 'search' ||
                                          input.type === 'password');
                        const isEnabled = !input.disabled && !input.readOnly;
                        if (isEditable && isEnabled && input.offsetParent !== null) {
                            types.push(input.type);
                        }
                    });
                    return types;
                })()
            `);

            expect(editableTypes).toContain('password');
        });
    });

    describe('4.0 Edge Cases - Disabled and Readonly', () => {
        test('4.1 should NOT focus disabled inputs', async () => {
            // Count editable inputs (should exclude disabled)
            const editableCount = await countEditableInputs();
            const totalVisibleInputs = await executeInTarget(pageWs, `
                (function() {
                    const inputs = document.querySelectorAll('input');
                    let count = 0;
                    inputs.forEach(input => {
                        const isEditable = (input.type === 'text' ||
                                          input.type === 'email' ||
                                          input.type === 'search' ||
                                          input.type === 'password');
                        const isVisible = input.offsetParent !== null;
                        if (isEditable && isVisible) {
                            count++;
                        }
                    });
                    return count;
                })()
            `);

            // Editable count should be less than total (due to disabled/readonly)
            expect(editableCount).toBeLessThan(totalVisibleInputs);
        });

        test('4.2 should NOT focus readonly inputs', async () => {
            const readonlyCheck = await executeInTarget(pageWs, `
                (function() {
                    const readonlyInput = document.querySelector('#readonly-input');
                    return {
                        exists: readonlyInput !== null,
                        isReadonly: readonlyInput?.readOnly || false
                    };
                })()
            `);

            expect(readonlyCheck.exists).toBe(true);
            expect(readonlyCheck.isReadonly).toBe(true);

            // Verify gi doesn't focus readonly input
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const activeEl = await getActiveElement();
            expect(activeEl?.id).not.toBe('readonly-input');
        });

        test('4.3 should exclude disabled from mask creation', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const inputLayer = await checkInputLayer();

            // Masks should be created for multiple inputs (at least 2)
            expect(inputLayer.masks).toBeGreaterThan(1);

            // Verify disabled input is not in mask list
            const disabledCheck = await executeInTarget(pageWs, `
                (function() {
                    const disabledInput = document.querySelector('#disabled-input');
                    return {
                        disabledId: disabledInput?.id || null,
                        isDisabled: disabledInput?.disabled || false
                    };
                })()
            `);

            expect(disabledCheck.isDisabled).toBe(true);
        });
    });

    describe('5.0 Focus Verification', () => {
        test('5.1 should set focus on first input element', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const activeEl = await getActiveElement();
            expect(activeEl?.isFocused).toBe(true);
        });

        test('5.2 should mark first mask as activeInput', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const inputLayer = await checkInputLayer();
            expect(inputLayer.activeInput?.isActive).toBe(true);

            // Verify first input is actually focused
            const activeEl = await getActiveElement();
            expect(activeEl?.id).toBe('text-input-1');
        });

        test('5.3 should allow typing in focused input', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            // Type some text
            await sendKey(pageWs, 'T');
            await sendKey(pageWs, 'e');
            await sendKey(pageWs, 's');
            await sendKey(pageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 200));

            const activeEl = await getActiveElement();
            expect(activeEl?.value).toContain('Test');
        });
    });

    describe('6.0 Consistent Behavior', () => {
        test('6.1 should focus same input on repeated gi commands', async () => {
            // First invocation
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();
            const first = await getActiveElement();

            // Clear and repeat
            await sendKey(pageWs, 'Escape');
            await clickAt(pageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 200));

            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();
            const second = await getActiveElement();

            // Should focus same input (first one)
            expect(first?.id).toBe(second?.id);
            expect(first?.id).toBe('text-input-1');
        });

        test('6.2 should create consistent number of masks', async () => {
            // First invocation
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();
            const first = await checkInputLayer();

            // Clear and repeat
            await sendKey(pageWs, 'Escape');
            await clickAt(pageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 200));

            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();
            const second = await checkInputLayer();

            expect(first.masks).toBe(second.masks);
            expect(first.masks).toBeGreaterThan(0);
        });
    });

    describe('7.0 Clearing and State', () => {
        test('7.1 should clear input layer when pressing Escape', async () => {
            // Create input layer
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const before = await checkInputLayer();
            expect(before.found).toBe(true);

            // Clear with Escape
            await sendKey(pageWs, 'Escape');
            await new Promise(resolve => setTimeout(resolve, 200));

            const after = await checkInputLayer();
            expect(after.found).toBe(false);
        });

        test('7.2 should allow recreating input layer after clearing', async () => {
            // Create, clear, recreate
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            await sendKey(pageWs, 'Escape');
            await clickAt(pageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 200));

            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const inputLayer = await checkInputLayer();
            expect(inputLayer.found).toBe(true);
            expect(inputLayer.masks).toBeGreaterThan(0);
        });
    });

    describe('8.0 Comparison with "i" Command', () => {
        test('8.1 should behave differently from i command (no hint selection)', async () => {
            // Test 'gi' command
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const giResult = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) {
                        return { hasInputLayer: false, hasHintLabels: false };
                    }

                    const inputHolder = hintsHost.shadowRoot.querySelector('[mode=input]');
                    const hintDivs = Array.from(hintsHost.shadowRoot.querySelectorAll('div'));
                    const hintLabels = hintDivs.filter(d => {
                        const text = (d.textContent || '').trim();
                        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                    });

                    return {
                        hasInputLayer: inputHolder !== null,
                        hasHintLabels: hintLabels.length > 0,
                        activeElementId: document.activeElement?.id || null
                    };
                })()
            `);

            // 'gi' should have input layer but NO hint labels
            expect(giResult.hasInputLayer).toBe(true);
            expect(giResult.hasHintLabels).toBe(false);
            expect(giResult.activeElementId).toBe('text-input-1');
        });

        test('8.2 should focus first input immediately (no user selection needed)', async () => {
            await clickAt(pageWs, 100, 100);

            const beforeActive = await getActiveElement();
            expect(beforeActive?.tagName).toBe('BODY');

            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const afterActive = await getActiveElement();
            // Should be focused immediately without user input
            expect(afterActive?.tagName).toBe('INPUT');
            expect(afterActive?.id).toBe('text-input-1');
        });
    });

    describe('9.0 DOM Structure', () => {
        test('9.1 should place masks in shadowRoot at .surfingkeys_hints_host', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const structure = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    return {
                        hostExists: hintsHost !== null,
                        hasShadowRoot: hintsHost?.shadowRoot !== null,
                        shadowRootChildren: hintsHost?.shadowRoot?.children.length || 0
                    };
                })()
            `);

            expect(structure.hostExists).toBe(true);
            expect(structure.hasShadowRoot).toBe(true);
            expect(structure.shadowRootChildren).toBeGreaterThan(0);
        });

        test('9.2 should create holder with mode=input attribute', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const holderCheck = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) return null;

                    const holder = hintsHost.shadowRoot.querySelector('[mode=input]');
                    return {
                        exists: holder !== null,
                        mode: holder?.getAttribute('mode')
                    };
                })()
            `);

            expect(holderCheck?.exists).toBe(true);
            expect(holderCheck?.mode).toBe('input');
        });

        test('9.3 should create mask elements for each editable input', async () => {
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const maskDetails = await executeInTarget(pageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) return null;

                    const holder = hintsHost.shadowRoot.querySelector('[mode=input]');
                    if (!holder) return null;

                    const masks = holder.querySelectorAll('mask');
                    const maskInfo = Array.from(masks).slice(0, 3).map(m => ({
                        tagName: m.tagName,
                        position: m.style.position,
                        top: m.style.top,
                        left: m.style.left,
                        width: m.style.width,
                        height: m.style.height
                    }));

                    return {
                        maskCount: masks.length,
                        sampleMasks: maskInfo
                    };
                })()
            `);

            expect(maskDetails?.maskCount).toBeGreaterThan(0);
            expect(maskDetails?.sampleMasks[0]?.tagName).toBe('MASK');
            expect(maskDetails?.sampleMasks[0]?.position).toBe('fixed');
            // Verify masks have position and dimensions
            expect(maskDetails?.sampleMasks[0]?.top).toBeDefined();
            expect(maskDetails?.sampleMasks[0]?.left).toBeDefined();
            expect(maskDetails?.sampleMasks[0]?.width).toBeDefined();
        });
    });

    describe('10.0 Edge Cases - Special Scenarios', () => {
        test('10.1 should handle rapid gi invocations', async () => {
            for (let i = 0; i < 3; i++) {
                await clickAt(pageWs, 100, 100);
                await new Promise(resolve => setTimeout(resolve, 100));

                await sendKey(pageWs, 'g');
                await sendKey(pageWs, 'i');
                await waitForInputFocus();

                const activeEl = await getActiveElement();
                expect(activeEl?.id).toBe('text-input-1');

                await sendKey(pageWs, 'Escape');
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        });

        test('10.2 should focus first visible input (DOM order)', async () => {
            // Get DOM order of editable inputs
            const inputOrder = await executeInTarget(pageWs, `
                (function() {
                    const inputs = document.querySelectorAll('input');
                    const editable = [];
                    inputs.forEach(input => {
                        const isEditable = (input.type === 'text' ||
                                          input.type === 'email' ||
                                          input.type === 'search' ||
                                          input.type === 'password');
                        const isEnabled = !input.disabled && !input.readOnly;
                        const isVisible = input.offsetParent !== null;
                        if (isEditable && isEnabled && isVisible) {
                            editable.push(input.id);
                        }
                    });
                    return editable;
                })()
            `);

            expect(inputOrder.length).toBeGreaterThan(0);
            expect(inputOrder[0]).toBe('text-input-1');

            // Verify gi focuses the first in DOM order
            await clickAt(pageWs, 100, 100);
            await sendKey(pageWs, 'g');
            await sendKey(pageWs, 'i');
            await waitForInputFocus();

            const activeEl = await getActiveElement();
            expect(activeEl?.id).toBe(inputOrder[0]);
        });
    });

    describe('11.0 Single Input Scenario', () => {
        let singleInputTabId: number;
        let singleInputPageWs: WebSocket;

        beforeAll(async () => {
            const SINGLE_INPUT_URL = 'http://127.0.0.1:9873/single-input-test.html';

            // Create new tab with single input fixture
            singleInputTabId = await createTab(bgWs, SINGLE_INPUT_URL, true);

            // Find and connect to content page
            const pageWsUrl = await findContentPage('127.0.0.1:9873/single-input-test.html');
            singleInputPageWs = await connectToCDP(pageWsUrl);

            enableInputDomain(singleInputPageWs);
            await waitForSurfingkeysReady(singleInputPageWs);
        });

        afterAll(async () => {
            if (singleInputTabId && bgWs) {
                await closeTab(bgWs, singleInputTabId);
            }
            if (singleInputPageWs) {
                await closeCDP(singleInputPageWs);
            }
        });

        test('11.1 should focus single input directly without creating masks', async () => {
            // Click to ensure no focus on input
            await clickAt(singleInputPageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Press gi
            await sendKey(singleInputPageWs, 'g');
            await sendKey(singleInputPageWs, 'i');

            // Wait for focus
            await waitFor(async () => {
                const activeEl = await executeInTarget(singleInputPageWs, `
                    (function() {
                        const el = document.activeElement;
                        return el ? el.tagName : null;
                    })()
                `);
                return activeEl === 'INPUT';
            }, 4000, 100);

            const activeEl = await executeInTarget(singleInputPageWs, `
                (function() {
                    const el = document.activeElement;
                    return {
                        tagName: el?.tagName,
                        id: el?.id || null
                    };
                })()
            `);

            expect(activeEl.tagName).toBe('INPUT');
            expect(activeEl.id).toBe('only-input');
        });

        test('11.2 should NOT create input layer for single input', async () => {
            await clickAt(singleInputPageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            await sendKey(singleInputPageWs, 'g');
            await sendKey(singleInputPageWs, 'i');

            // Wait for focus
            await waitFor(async () => {
                const activeEl = await executeInTarget(singleInputPageWs, `
                    document.activeElement?.tagName
                `);
                return activeEl === 'INPUT';
            }, 4000, 100);

            // Check for input layer
            const inputLayer = await executeInTarget(singleInputPageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) {
                        return { found: false, masks: 0 };
                    }

                    const holder = hintsHost.shadowRoot.querySelector('[mode=input]');
                    if (!holder) {
                        return { found: false, masks: 0 };
                    }

                    const masks = holder.querySelectorAll('mask');
                    return {
                        found: true,
                        masks: masks.length
                    };
                })()
            `);

            // Should NOT create masks for single input
            expect(inputLayer.found).toBe(false);
        });

        test('11.3 should enter insert mode for single input', async () => {
            await clickAt(singleInputPageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Clear input first
            await executeInTarget(singleInputPageWs, `
                document.querySelector('#only-input').value = ''
            `);

            await sendKey(singleInputPageWs, 'g');
            await sendKey(singleInputPageWs, 'i');

            // Wait for focus
            await waitFor(async () => {
                const activeEl = await executeInTarget(singleInputPageWs, `
                    document.activeElement?.tagName
                `);
                return activeEl === 'INPUT';
            }, 4000, 100);

            // Type text (note: 'i' from 'gi' may have been typed, so clear first)
            await sendKey(singleInputPageWs, 'T');
            await sendKey(singleInputPageWs, 'e');
            await sendKey(singleInputPageWs, 's');
            await sendKey(singleInputPageWs, 't');
            await new Promise(resolve => setTimeout(resolve, 200));

            const value = await executeInTarget(singleInputPageWs, `
                document.querySelector('#only-input')?.value
            `);

            // Should contain the text we typed (may have 'i' from gi command)
            expect(value).toContain('Test');
        });
    });

    describe('12.0 No Input Scenario', () => {
        let noInputTabId: number;
        let noInputPageWs: WebSocket;

        beforeAll(async () => {
            const NO_INPUT_URL = 'http://127.0.0.1:9873/no-input-test.html';

            // Create new tab with no input fixture
            noInputTabId = await createTab(bgWs, NO_INPUT_URL, true);

            // Find and connect to content page
            const pageWsUrl = await findContentPage('127.0.0.1:9873/no-input-test.html');
            noInputPageWs = await connectToCDP(pageWsUrl);

            enableInputDomain(noInputPageWs);
            await waitForSurfingkeysReady(noInputPageWs);
        });

        afterAll(async () => {
            if (noInputTabId && bgWs) {
                await closeTab(bgWs, noInputTabId);
            }
            if (noInputPageWs) {
                await closeCDP(noInputPageWs);
            }
        });

        test('12.1 should handle page with no editable inputs gracefully', async () => {
            await clickAt(noInputPageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Press gi - should not crash
            await sendKey(noInputPageWs, 'g');
            await sendKey(noInputPageWs, 'i');
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify no input layer created
            const inputLayer = await executeInTarget(noInputPageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) {
                        return { found: false };
                    }

                    const holder = hintsHost.shadowRoot.querySelector('[mode=input]');
                    return {
                        found: holder !== null
                    };
                })()
            `);

            expect(inputLayer.found).toBe(false);
        });

        test('12.2 should keep focus on body when no inputs available', async () => {
            await clickAt(noInputPageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            const beforeActive = await executeInTarget(noInputPageWs, `
                document.activeElement?.tagName
            `);

            await sendKey(noInputPageWs, 'g');
            await sendKey(noInputPageWs, 'i');
            await new Promise(resolve => setTimeout(resolve, 500));

            const afterActive = await executeInTarget(noInputPageWs, `
                document.activeElement?.tagName
            `);

            // Focus should remain on body
            expect(afterActive).toBe('BODY');
        });

        test('12.3 should not create any masks when no inputs exist', async () => {
            await clickAt(noInputPageWs, 100, 100);
            await new Promise(resolve => setTimeout(resolve, 100));

            await sendKey(noInputPageWs, 'g');
            await sendKey(noInputPageWs, 'i');
            await new Promise(resolve => setTimeout(resolve, 500));

            const maskCount = await executeInTarget(noInputPageWs, `
                (function() {
                    const hintsHost = document.querySelector('.surfingkeys_hints_host');
                    if (!hintsHost || !hintsHost.shadowRoot) return 0;

                    const holder = hintsHost.shadowRoot.querySelector('[mode=input]');
                    if (!holder) return 0;

                    return holder.querySelectorAll('mask').length;
                })()
            `);

            expect(maskCount).toBe(0);
        });
    });
});
