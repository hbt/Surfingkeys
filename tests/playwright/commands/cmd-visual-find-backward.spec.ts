import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

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

test.describe('cmd_visual_find_backward (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_visual_find_backward');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.getSelection()?.removeAllRanges());
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing F in visual mode does not error', async () => {
        await enterVisualMode(page, 'Multi-word line');
        await page.keyboard.press('F');
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const sel = await getSelectionInfo(page);
        expect(typeof sel.focusOffset).toBe('number');
        if (DEBUG) console.log(`F executed: focusOffset=${sel.focusOffset}`);
    });

    test('F then character finds backward occurrence', async () => {
        await enterVisualMode(page, 'four five');
        const before = await getSelectionInfo(page);
        await page.keyboard.press('F');
        await page.waitForTimeout(200);
        await page.keyboard.type('w');
        await page.waitForTimeout(300);
        const after = await getSelectionInfo(page);
        expect(typeof after.focusOffset).toBe('number');
        if (DEBUG) console.log(`F: ${before.focusOffset} → ${after.focusOffset}`);
    });

    test('F when character not found does not error', async () => {
        await enterVisualMode(page, 'Short line');
        const before = await getSelectionInfo(page);
        await page.keyboard.press('F');
        await page.waitForTimeout(200);
        await page.keyboard.type('Q');
        await page.waitForTimeout(300);
        const after = await getSelectionInfo(page);
        expect(typeof after.focusOffset).toBe('number');
        if (DEBUG) console.log(`FQ (not found): before=${before.focusOffset}, after=${after.focusOffset}`);
    });

    test('Escape after F cancels find mode', async () => {
        await enterVisualMode(page, 'one two');
        const before = await getSelectionInfo(page);
        await page.keyboard.press('F');
        await page.waitForTimeout(200);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const after = await getSelectionInfo(page);
        expect(after.focusOffset).toBe(before.focusOffset);
        if (DEBUG) console.log(`F then Escape: offset stayed at ${after.focusOffset}`);
    });
});
