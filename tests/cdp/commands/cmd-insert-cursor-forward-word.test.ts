/**
 * CDP Test: cmd_insert_cursor_forward_word
 *
 * Tests for the insert-mode command: move cursor forward one word.
 * - Command: cmd_insert_cursor_forward_word
 * - Invocation: direct via CustomEvent bridge (invokeCommand), no key simulation
 * - Implementation: nextNonWord(element.value, 1, element.selectionStart)
 *
 * nextNonWord(str, dir=1, cur) behavior for "hello world" (len=11):
 *   cur=0  → 5  (scans h,e,l,l,o → stops at space at index 5)
 *   cur=5  → 11 (advances to 6, scans w,o,r,l,d → end — fix: commit 802708d)
 *   cur=6  → 11 (scans w,o,r,l,d → cur=11 >= length, returns 11)
 *   cur=11 → 11 (cur >= length immediately, returns 11)
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-insert-cursor-forward-word.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-insert-cursor-forward-word.test.ts
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
    clickAt,
    enableInputDomain,
    waitForSurfingkeysReady,
    waitFor,
    invokeCommand
} from '../utils/browser-actions';
import {
    startCoverage,
    captureBeforeCoverage,
    captureAfterCoverage,
    getCoverageDelta
} from '../utils/cdp-coverage';
import { CDP_PORT } from '../cdp-config';

const COVERAGE_ENABLED = process.env.CDP_COVERAGE !== '0';

describe('cmd_insert_cursor_forward_word', () => {
    jest.setTimeout(60000);

    let bgWs: WebSocket;
    let pageWs: WebSocket;
    let tabId: number;
    let beforeCovData: any = null;
    let currentTestName: string = '';

    const FIXTURE_URL = 'http://127.0.0.1:9873/input-test.html';

    // Click the first input element to activate the page and enter insert mode.
    // Resolves coordinates dynamically so this is layout-independent.
    async function clickInput() {
        const coords = await executeInTarget(pageWs, `
            (function() {
                const r = document.querySelector('#text-input-1').getBoundingClientRect();
                return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
            })()
        `);
        await clickAt(pageWs, coords.x, coords.y);
        await waitFor(async () => {
            const tag = await executeInTarget(pageWs, `document.activeElement.tagName`);
            return tag === 'INPUT';
        }, 4000, 100);
    }

    async function getInputState() {
        return executeInTarget(pageWs, `
            (function() {
                const el = document.activeElement;
                return {
                    value: el.value,
                    selectionStart: el.selectionStart,
                    selectionEnd: el.selectionEnd
                };
            })()
        `);
    }

    async function setInputState(value: string, cursorPos: number) {
        await executeInTarget(pageWs, `
            (function() {
                const el = document.activeElement;
                el.value = ${JSON.stringify(value)};
                el.setSelectionRange(${cursorPos}, ${cursorPos});
            })()
        `);
    }

    beforeAll(async () => {
        const cdpAvailable = await checkCDPAvailable();
        if (!cdpAvailable) {
            throw new Error(`Chrome DevTools Protocol not available on port ${CDP_PORT}`);
        }

        const bgInfo = await findExtensionBackground();
        bgWs = await connectToCDP(bgInfo.wsUrl);

        tabId = await createTab(bgWs, FIXTURE_URL, true);

        const pageWsUrl = await findContentPage('127.0.0.1:9873/input-test.html');
        pageWs = await connectToCDP(pageWsUrl);

        enableInputDomain(pageWs);
        await waitForSurfingkeysReady(pageWs);
        await startCoverage(pageWs, 'content-page');
    });

    beforeEach(async () => {
        const state = expect.getState();
        currentTestName = state.currentTestName || 'unknown-test';
        if (COVERAGE_ENABLED) { beforeCovData = await captureBeforeCoverage(pageWs); }
        await clickInput();
    });

    afterEach(async () => {
        await executeInTarget(pageWs, `document.activeElement?.blur()`);
        if (COVERAGE_ENABLED) { await captureAfterCoverage(pageWs, currentTestName, beforeCovData); }
    });

    afterAll(async () => {
        if (tabId && bgWs) { await closeTab(bgWs, tabId); }
        if (pageWs) { await closeCDP(pageWs); }
        if (bgWs) { await closeCDP(bgWs); }
    });

    describe('1.0 Fixture', () => {
        test('1.1 input-test.html loads', async () => {
            const title = await executeInTarget(pageWs, 'document.title');
            expect(title).toBe('Input Test Page');
        });
    });

    describe('2.0 Cursor Forward Word', () => {
        test('2.1 cursor at 0 moves to 5 (space after "hello")', async () => {
            await setInputState('hello world', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');

            const delta = await getCoverageDelta(pageWs, beforeCovData);
            expect(delta['nextNonWord']?.count).toBeGreaterThan(0);

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(5);
            expect(after.selectionEnd).toBe(5);
        });

        test('2.2 cursor at 6 (start of "world") moves to 11 (end)', async () => {
            await setInputState('hello world', 6);
            const before = await getInputState();
            expect(before.selectionStart).toBe(6);

            await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(11);
            expect(after.selectionEnd).toBe(11);
        });

        test('2.3 value unchanged, only cursor moves', async () => {
            await setInputState('hello world', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');

            const after = await getInputState();
            expect(after.value).toBe('hello world');
        });
    });

    describe('3.0 Edge Cases', () => {
        test('3.1 cursor at end stays at end (no movement)', async () => {
            await setInputState('hello world', 11);
            const before = await getInputState();
            expect(before.selectionStart).toBe(11);

            await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(11);
            expect(after.selectionEnd).toBe(11);
        });

        test('3.2 empty input stays at 0', async () => {
            await setInputState('', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');

            const after = await getInputState();
            expect(after.value).toBe('');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });

        test('3.3 cursor at non-word char (space) advances through next word', async () => {
            // fix 802708d: cur = cur + dir always advances by 1 first,
            // so cursor on space at 5 advances to 6, scans w,o,r,l,d → end = 11
            await setInputState('hello world', 5);
            const before = await getInputState();
            expect(before.selectionStart).toBe(5);

            await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(11);
            expect(after.selectionEnd).toBe(11);
        });

        test('3.4 single word — cursor at 0 moves to end', async () => {
            await setInputState('hello', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');

            const after = await getInputState();
            expect(after.value).toBe('hello');
            expect(after.selectionStart).toBe(5);
            expect(after.selectionEnd).toBe(5);
        });
    });

    describe('5.0 Bug Fix — cursor on non-word char now advances (commit 802708d)', () => {
        // Fixed in commit 802708d (PR #2393): `cur = cur + dir` always advances
        // by 1 first, so cursor on a \W char skips it and scans to next boundary.

        test('5.1 cursor on space between words advances to end of next word', async () => {
            // "hello world": cursor at 5 (space)
            // advances to 6, scans w,o,r,l,d → end = 11
            await setInputState('hello world', 5);
            await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');
            const after = await getInputState();
            expect(after.selectionStart).toBe(11);
        });

        test('5.2 cursor on mid-string space advances to next word boundary', async () => {
            // "one two three": cursor at 3 (space after "one")
            // advances to 4, scans t,w,o → space at 7 = 7
            await setInputState('one two three', 3);
            await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');
            const after = await getInputState();
            expect(after.selectionStart).toBe(7);
        });
    });

    describe('4.0 Invocation', () => {
        test('4.1 returns true for valid unique_id', async () => {
            await setInputState('hello', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            const result = await invokeCommand(pageWs, 'cmd_insert_cursor_forward_word');
            expect(result).toBe(true);
        });

        test('4.2 returns false for unknown unique_id', async () => {
            const result = await invokeCommand(pageWs, 'cmd_does_not_exist');
            expect(result).toBe(false);
        });
    });
});
