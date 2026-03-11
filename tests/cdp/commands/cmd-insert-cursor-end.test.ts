/**
 * CDP Test: cmd_insert_cursor_end
 *
 * Tests for the insert-mode command: move cursor to end of input.
 * - Command: cmd_insert_cursor_end
 * - Invocation: direct via CustomEvent bridge (invokeCommand), no key simulation
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-insert-cursor-end.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-insert-cursor-end.test.ts
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

describe('cmd_insert_cursor_end', () => {
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

    describe('2.0 Cursor End', () => {
        test('2.1 moves cursor from 0 to end of text', async () => {
            await setInputState('hello world', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_end');

            const delta = await getCoverageDelta(pageWs, beforeCovData);
            expect(delta['moveCursorEOL']?.count).toBeGreaterThan(0);

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(11);
            expect(after.selectionEnd).toBe(11);
        });

        test('2.2 value unchanged, only cursor moves', async () => {
            await setInputState('Sample text', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_end');

            const after = await getInputState();
            expect(after.value).toBe('Sample text');
            expect(after.selectionStart).toBe(11);
        });
    });

    describe('3.0 Edge Cases', () => {
        test('3.1 empty input stays at 0', async () => {
            await setInputState('', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_end');

            const after = await getInputState();
            expect(after.value).toBe('');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });

        test('3.2 single character — cursor moves from 0 to 1', async () => {
            await setInputState('x', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_end');

            const after = await getInputState();
            expect(after.value).toBe('x');
            expect(after.selectionStart).toBe(1);
            expect(after.selectionEnd).toBe(1);
        });

        test('3.3 cursor already at end — stays at end', async () => {
            await setInputState('hello world', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_cursor_end');
            const mid = await getInputState();
            expect(mid.selectionStart).toBe(11);

            await invokeCommand(pageWs, 'cmd_insert_cursor_end');
            const after = await getInputState();
            expect(after.selectionStart).toBe(11);
        });
    });

    describe('4.0 Invocation', () => {
        test('4.1 returns true for valid unique_id', async () => {
            await setInputState('hello', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            const result = await invokeCommand(pageWs, 'cmd_insert_cursor_end');
            expect(result).toBe(true);
        });

        test('4.2 returns false for unknown unique_id', async () => {
            const result = await invokeCommand(pageWs, 'cmd_does_not_exist');
            expect(result).toBe(false);
        });
    });
});
