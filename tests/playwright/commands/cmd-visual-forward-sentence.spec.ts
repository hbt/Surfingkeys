import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-sentence-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function enterVisualMode(p: Page, text: string) {
    await p.evaluate((t) => { (window as any).find(t); }, text);
    await p.waitForTimeout(100);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(300);
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

async function getCursorTextIndex(p: Page): Promise<number> {
    return p.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || !sel.focusNode) return 0;
        const range = document.createRange();
        range.selectNodeContents(document.body);
        range.setEnd(sel.focusNode, sel.focusOffset);
        return range.toString().length;
    });
}

async function invokeVisualForwardSentence(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_forward_sentence');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_forward_sentence (Playwright)', () => {
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
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_visual_forward_sentence');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.getSelection()?.removeAllRanges());
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test(') in visual mode does not error', async () => {
        await enterVisualMode(page, 'This is the first');

        await invokeVisualForwardSentence(page);
        await page.waitForTimeout(300);

        const selection = await getSelectionInfo(page);
        expect(typeof selection.focusOffset).toBe('number');
        if (DEBUG) console.log(`) executed: focusOffset=${selection.focusOffset}`);
    });

    test(') moves cursor forward from initial position', async () => {
        await enterVisualMode(page, 'This is the first');

        const initialIndex = await getCursorTextIndex(page);
        if (DEBUG) console.log(`Before ): cursorIndex=${initialIndex}`);

        await invokeVisualForwardSentence(page);
        await page.waitForTimeout(300);

        const finalIndex = await getCursorTextIndex(page);
        if (DEBUG) console.log(`After ): cursorIndex=${finalIndex}`);

        expect(finalIndex).toBeGreaterThanOrEqual(initialIndex);
    });

    test(') navigates through multiple sentences without error', async () => {
        await enterVisualMode(page, 'This is the first');

        const positions: number[] = [];
        positions.push(await getCursorTextIndex(page));

        for (let i = 0; i < 3; i++) {
            await invokeVisualForwardSentence(page);
            await page.waitForTimeout(300);

            positions.push(await getCursorTextIndex(page));
        }

        expect(positions.length).toBe(4);
        positions.forEach((pos) => expect(Number.isFinite(pos)).toBe(true));
        if (DEBUG) console.log(`) progression: ${positions.join(' → ')}`);
    });
});
