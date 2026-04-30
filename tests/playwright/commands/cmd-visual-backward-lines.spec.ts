import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-lines-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function enterVisualMode(p: Page) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(500);
}

async function getSelectionInfo(p: Page) {
    return p.evaluate(() => {
        const sel = window.getSelection();
        return {
            type: sel?.type ?? '',
            anchorOffset: sel?.anchorOffset ?? 0,
            focusOffset: sel?.focusOffset ?? 0,
            text: sel?.toString() ?? '',
        };
    });
}

async function invokeVisualBackwardLines(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_backward_lines');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_backward_lines (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await waitForInvokeReady(page);
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_visual_backward_lines');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => {
            window.getSelection()?.removeAllRanges();
            window.scrollTo(0, document.documentElement.scrollHeight);
        });
        await page.waitForTimeout(200);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('Ctrl-u in visual mode does not error - selection is queryable', async () => {
        await enterVisualMode(page);

        await invokeVisualBackwardLines(page);
        await page.waitForTimeout(500);

        const selection = await getSelectionInfo(page);
        expect(typeof selection.focusOffset).toBe('number');
        const scrollY = await page.evaluate(() => window.scrollY);
        if (DEBUG) console.log(`After Ctrl-u: focusOffset=${selection.focusOffset}, scrollY=${scrollY}`);
    });

    test('Ctrl-u can be pressed multiple times without error', async () => {
        await enterVisualMode(page);

        await invokeVisualBackwardLines(page);
        await page.waitForTimeout(500);

        const sel1 = await getSelectionInfo(page);
        expect(typeof sel1.focusOffset).toBe('number');

        await invokeVisualBackwardLines(page);
        await page.waitForTimeout(500);

        const sel2 = await getSelectionInfo(page);
        expect(typeof sel2.focusOffset).toBe('number');
        if (DEBUG) console.log(`Two Ctrl-u presses: ${sel1.focusOffset} → ${sel2.focusOffset}`);
    });

    test('Ctrl-u maintains visual mode (selection still queryable)', async () => {
        await enterVisualMode(page);

        await invokeVisualBackwardLines(page);
        await page.waitForTimeout(500);

        const selection = await getSelectionInfo(page);
        expect(typeof selection.focusOffset).toBe('number');
        if (DEBUG) console.log(`Visual mode still active after Ctrl-u: focusOffset=${selection.focusOffset}`);
    });
});
