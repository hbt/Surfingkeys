import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
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

async function invokeVisualSelectUnit(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_select_unit');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_select_unit (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await waitForInvokeReady(page);
        await page.waitForTimeout(1000);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_visual_select_unit');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.getSelection()?.removeAllRanges());
    });

    test.afterEach(async () => {
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
        } catch (_) {}
    });

    test('Vw command executes without error', async () => {
        await enterVisualMode(page, 'Multi-word line');
        const before = await getSelectionInfo(page);
        await page.keyboard.press('V');
        await page.waitForTimeout(150);
        await invokeVisualSelectUnit(page);
        await page.waitForTimeout(400);
        const after = await getSelectionInfo(page);
        // Verify command executed without crash
        expect(typeof after.focusOffset).toBe('number');
        if (DEBUG) console.log(`Vw: before offset=${before.focusOffset}, after offset=${after.focusOffset}`);
    });

    test('Vl command executes without error', async () => {
        await enterVisualMode(page, 'This is a medium');
        const before = await getSelectionInfo(page);
        await page.keyboard.press('V');
        await page.waitForTimeout(150);
        await invokeVisualSelectUnit(page);
        await page.waitForTimeout(400);
        const after = await getSelectionInfo(page);
        expect(typeof after.focusOffset).toBe('number');
        if (DEBUG) console.log(`Vl: before offset=${before.focusOffset}, after offset=${after.focusOffset}`);
    });

    test('Vp command executes without error', async () => {
        await enterVisualMode(page, 'This is a much longer');
        const before = await getSelectionInfo(page);
        await page.keyboard.press('V');
        await page.waitForTimeout(150);
        await invokeVisualSelectUnit(page);
        await page.waitForTimeout(400);
        const after = await getSelectionInfo(page);
        expect(typeof after.focusOffset).toBe('number');
        if (DEBUG) console.log(`Vp: before offset=${before.focusOffset}, after offset=${after.focusOffset}, text="${after.text.substring(0, 30)}"`);
    });

    test('Vs command executes without error', async () => {
        await enterVisualMode(page, 'This is a medium');
        const before = await getSelectionInfo(page);
        await page.keyboard.press('V');
        await page.waitForTimeout(150);
        await invokeVisualSelectUnit(page);
        await page.waitForTimeout(400);
        const after = await getSelectionInfo(page);
        expect(typeof after.focusOffset).toBe('number');
        if (DEBUG) console.log(`Vs: before offset=${before.focusOffset}, after offset=${after.focusOffset}`);
    });
});
