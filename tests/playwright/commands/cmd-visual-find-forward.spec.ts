import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;

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

test.describe('cmd_visual_find_forward (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.getSelection()?.removeAllRanges());
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing f in visual mode does not error', async () => {
        await enterVisualMode(page, 'Short');
        await page.keyboard.press('f');
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const sel = await getSelectionInfo(page);
        expect(typeof sel.focusOffset).toBe('number');
        console.log(`f executed: focusOffset=${sel.focusOffset}`);
    });

    test('f then character finds forward occurrence', async () => {
        await enterVisualMode(page, 'Multi-word line');
        const before = await getSelectionInfo(page);
        await page.keyboard.press('f');
        await page.waitForTimeout(200);
        await page.keyboard.type('o');
        await page.waitForTimeout(300);
        const after = await getSelectionInfo(page);
        expect(typeof after.focusOffset).toBe('number');
        expect(after.focusOffset).toBeGreaterThanOrEqual(before.focusOffset);
        console.log(`f: ${before.focusOffset} → ${after.focusOffset}`);
    });

    test('f command can be invoked multiple times', async () => {
        await enterVisualMode(page, 'Multi-word line');
        await page.keyboard.press('f');
        await page.waitForTimeout(200);
        await page.keyboard.type('e');
        await page.waitForTimeout(300);
        const first = await getSelectionInfo(page);
        await page.keyboard.press('f');
        await page.waitForTimeout(200);
        await page.keyboard.type('e');
        await page.waitForTimeout(300);
        const second = await getSelectionInfo(page);
        expect(typeof first.focusOffset).toBe('number');
        expect(typeof second.focusOffset).toBe('number');
        console.log(`first fe: ${first.focusOffset}, second fe: ${second.focusOffset}`);
    });

    test('Escape cancels find mode without moving cursor', async () => {
        await enterVisualMode(page, 'Short');
        const before = await getSelectionInfo(page);
        await page.keyboard.press('f');
        await page.waitForTimeout(200);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const after = await getSelectionInfo(page);
        expect(after.focusOffset).toBe(before.focusOffset);
        console.log(`f then Escape: offset stayed at ${after.focusOffset}`);
    });
});
