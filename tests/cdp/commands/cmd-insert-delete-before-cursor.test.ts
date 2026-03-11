/**
 * CDP Test: cmd_insert_delete_before_cursor
 *
 * Tests for the insert-mode command: delete all text before cursor.
 * - Command: cmd_insert_delete_before_cursor
 * - Invocation: direct via CustomEvent bridge (invokeCommand), no key simulation
 * - Behavior: element.value = element.value.substr(element.selectionStart);
 *             element.setSelectionRange(0, 0);
 *
 * Usage:
 *   Headless:    ./bin/dbg test-run tests/cdp/commands/cmd-insert-delete-before-cursor.test.ts
 *   Live:        npm run test:cdp:live tests/cdp/commands/cmd-insert-delete-before-cursor.test.ts
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

describe('cmd_insert_delete_before_cursor', () => {
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

    describe('2.0 Delete Before Cursor', () => {
        test('2.1 deletes text before cursor when cursor is in middle', async () => {
            await setInputState('hello world', 5);
            const before = await getInputState();
            expect(before.selectionStart).toBe(5);

            await invokeCommand(pageWs, 'cmd_insert_delete_before_cursor');

            const delta = await getCoverageDelta(pageWs, beforeCovData);
            expect(delta['getRealEdit']?.count).toBeGreaterThan(0);

            const after = await getInputState();
            expect(after.value).toBe(' world');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });

        test('2.2 deletes all text when cursor is at end', async () => {
            await setInputState('hello world', 11);
            const before = await getInputState();
            expect(before.selectionStart).toBe(11);

            await invokeCommand(pageWs, 'cmd_insert_delete_before_cursor');

            const after = await getInputState();
            expect(after.value).toBe('');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });

        test('2.3 cursor near start deletes only first character', async () => {
            await setInputState('hello', 1);
            const before = await getInputState();
            expect(before.selectionStart).toBe(1);

            await invokeCommand(pageWs, 'cmd_insert_delete_before_cursor');

            const after = await getInputState();
            expect(after.value).toBe('ello');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });
    });

    describe('3.0 Edge Cases', () => {
        test('3.1 cursor at 0 — nothing deleted, value unchanged', async () => {
            await setInputState('hello world', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_delete_before_cursor');

            const after = await getInputState();
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });

        test('3.2 empty input at position 0 remains empty', async () => {
            await setInputState('', 0);
            const before = await getInputState();
            expect(before.selectionStart).toBe(0);

            await invokeCommand(pageWs, 'cmd_insert_delete_before_cursor');

            const after = await getInputState();
            expect(after.value).toBe('');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });

        test('3.3 cursor at position 3 of 6-char string', async () => {
            await setInputState('abcdef', 3);
            const before = await getInputState();
            expect(before.selectionStart).toBe(3);

            await invokeCommand(pageWs, 'cmd_insert_delete_before_cursor');

            const after = await getInputState();
            expect(after.value).toBe('def');
            expect(after.selectionStart).toBe(0);
            expect(after.selectionEnd).toBe(0);
        });
    });

    describe('4.0 Preservation', () => {
        test('4.1 text at and after cursor is preserved', async () => {
            await setInputState('hello world test', 5);
            const before = await getInputState();
            expect(before.selectionStart).toBe(5);

            await invokeCommand(pageWs, 'cmd_insert_delete_before_cursor');

            const after = await getInputState();
            expect(after.value).toBe(' world test');
            expect(after.selectionStart).toBe(0);
        });

        test('4.2 text after cursor with alphanumeric chars is preserved', async () => {
            await setInputState('abc123', 3);
            const before = await getInputState();
            expect(before.selectionStart).toBe(3);

            await invokeCommand(pageWs, 'cmd_insert_delete_before_cursor');

            const after = await getInputState();
            expect(after.value).toBe('123');
            expect(after.selectionStart).toBe(0);
        });
    });

    describe('5.0 Invocation', () => {
        test('5.1 returns true for valid unique_id', async () => {
            await setInputState('hello', 3);
            const before = await getInputState();
            expect(before.selectionStart).toBe(3);

            const result = await invokeCommand(pageWs, 'cmd_insert_delete_before_cursor');
            expect(result).toBe(true);
        });

        test('5.2 returns false for unknown unique_id', async () => {
            const result = await invokeCommand(pageWs, 'cmd_does_not_exist');
            expect(result).toBe(false);
        });
    });
});
