/**
 * CDP Test: cmd_insert_cursor_backward_word
 *
 * Tests for the insert-mode command: move cursor backward one word.
 * - Command: cmd_insert_cursor_backward_word
 * - Invocation: direct via CustomEvent bridge (invokeCommand), no key simulation
 * - Behavior: nextNonWord(element.value, -1, element.selectionStart)
 *   Scans backward from cur-1; stops at first \W character or start of string.
 *
 * nextNonWord positions for "hello world" (len=11):
 *   cursor 11 → 5  (scans d→l→r→o→w→space(5), stops at \W)
 *   cursor 6  → 5  (starts at 5=' ', immediately stops)
 *   cursor 5  → 0  (scans o→l→l→e→h→ cur=-1 → clamped to 0)
 *   cursor 0  → 0  (starts at -1 → clamped to 0)
 *
 * nextNonWord positions for "one two three" (len=13):
 *   cursor 13 → 7  (scans e→e→r→h→t→space(7), stops at \W)
 *   cursor 7  → 3  (scans o→w→t→space(3), stops at \W)
 *   cursor 3  → 0  (scans e→n→o→ cur=-1 → clamped to 0)
 *   cursor 0  → 0  (starts at -1 → clamped to 0)
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-insert-cursor-backward-word.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-insert-cursor-backward-word.test.ts
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

describe('cmd_insert_cursor_backward_word', () => {
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

    describe('2.0 Cursor Backward Word', () => {
        test('2.1 moves cursor from end of text to just before last word', async () => {
            // "hello world" cursor at 11 (end): scans d→l→r→o→w→space(5), stops at \W → pos=5
            await setInputState('hello world', 11);
            const before = await getInputState();
            expect(before.selectionStart).toBe(11);

            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');

            const delta = await getCoverageDelta(pageWs, beforeCovData);
            expect(delta['nextNonWord']?.count).toBeGreaterThan(0);

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(5);
            expect(after.selectionEnd).toBe(5);
        });

        test('2.2 cursor at start of word stops at space before it', async () => {
            // "hello world" cursor at 6 (start of "world"): starts at 5=' ', immediately stops → pos=5
            await setInputState('hello world', 6);
            const before = await getInputState();
            expect(before.selectionStart).toBe(6);

            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(5);
            expect(after.selectionEnd).toBe(5);
        });

        test('2.3 cursor at space scans through first word to start of string', async () => {
            // "hello world" cursor at 5 (the space): starts at 4='o', scans o→l→l→e→h→cur=-1 → clamped to 0
            await setInputState('hello world', 5);
            const before = await getInputState();
            expect(before.selectionStart).toBe(5);

            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });
    });

    describe('3.0 Edge Cases', () => {
        test('3.1 cursor at 0 stays at 0', async () => {
            // starts at -1, immediately clamped to 0
            await setInputState('hello world', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });

        test('3.2 empty input stays at 0', async () => {
            await setInputState('', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');

            const after = await getInputState();
            expect(after.value).toBe('');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });

        test('3.3 single word moves cursor from end to start', async () => {
            // "hello" cursor at 5: scans o→l→l→e→h→cur=-1 → clamped to 0
            await setInputState('hello', 5);
            const before = await getInputState();
            expect(before.selectionStart).toBe(5);

            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');

            const after = await getInputState();
            expect(after.value).toBe('hello');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });
    });

    describe('4.0 Sequential Invocations', () => {
        test('4.1 multiple backward steps through "one two three"', async () => {
            // "one two three": o=0,n=1,e=2,' '=3,t=4,w=5,o=6,' '=7,t=8,h=9,r=10,e=11,e=12, len=13
            await setInputState('one two three', 13);
            const before = await getInputState();
            expect(before.selectionStart).toBe(13);

            // Step 1: cursor at 13 → scans e→e→r→h→t→space(7), stops → pos=7
            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');
            const after1 = await getInputState();
            expect(after1.selectionStart).toBe(7);

            // Step 2: cursor at 7 → starts at 6='o', scans o→w→t→space(3), stops → pos=3
            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');
            const after2 = await getInputState();
            expect(after2.selectionStart).toBe(3);

            // Step 3: cursor at 3 → starts at 2='e', scans e→n→o→cur=-1 → clamped to 0
            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');
            const after3 = await getInputState();
            expect(after3.selectionStart).toBe(0);

            // Step 4: cursor at 0 → starts at -1 → clamped to 0, no movement
            await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');
            const after4 = await getInputState();
            expect(after4.selectionStart).toBe(0);
        });
    });

    describe('5.0 Invocation', () => {
        test('5.1 returns true for valid unique_id', async () => {
            await setInputState('hello', 5);
            const before = await getInputState();
            expect(before.selectionStart).toBe(5);

            const result = await invokeCommand(pageWs, 'cmd_insert_cursor_backward_word');
            expect(result).toBe(true);
        });

        test('5.2 returns false for unknown unique_id', async () => {
            const result = await invokeCommand(pageWs, 'cmd_does_not_exist');
            expect(result).toBe(false);
        });
    });
});
