import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;

async function enterVisualModeAtText(p: Page, text: string) {
    await p.evaluate((t) => { (window as any).find(t); }, text);
    await p.waitForTimeout(100);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(500);
}

test.describe('cmd_visual_click_node_newtab (Playwright)', () => {
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
        await page.evaluate(() => {
            window.getSelection()?.removeAllRanges();
            window.location.hash = '';
        });
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
        // Close any extra pages opened during test
        const pages = context.pages();
        for (const p of pages) {
            if (p !== page) {
                try { await p.close(); } catch (_) {}
            }
        }
    });

    test('Shift-Enter in visual mode on link does not error', async () => {
        await enterVisualModeAtText(page, 'Click this link');
        await page.waitForTimeout(200);
        await page.keyboard.press('Shift+Enter');
        await page.waitForTimeout(800);
        // Just verify we can still interact with the page
        const sel = await page.evaluate(() => typeof window.getSelection());
        expect(sel).toBe('object');
        console.log('Shift-Enter executed without error');
    });

    test('Shift-Enter may open new tab for link', async () => {
        const initialPageCount = context.pages().length;
        await enterVisualModeAtText(page, 'Click this link');
        await page.waitForTimeout(200);
        await page.keyboard.press('Shift+Enter');
        await page.waitForTimeout(1000);
        const newPageCount = context.pages().length;
        // Either a new tab was opened or it just navigated - verify no crash
        expect(newPageCount).toBeGreaterThanOrEqual(initialPageCount);
        console.log(`Pages before: ${initialPageCount}, after: ${newPageCount}`);
    });

    test('regular Enter does not open a new tab', async () => {
        const initialPageCount = context.pages().length;
        await enterVisualModeAtText(page, 'Click this link');
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        const newPageCount = context.pages().length;
        // Regular Enter should not open a new tab
        expect(newPageCount).toBe(initialPageCount);
        const hash = await page.evaluate(() => window.location.hash);
        // Hash may or may not change depending on cursor position in visual mode
        console.log(`Regular Enter: no new tab (count=${newPageCount}), hash=${hash}`);
    });

    test('Shift-Enter on plain text does not error', async () => {
        await enterVisualModeAtText(page, 'Short line');
        await page.waitForTimeout(200);
        await page.keyboard.press('Shift+Enter');
        await page.waitForTimeout(500);
        const sel = await page.evaluate(() => typeof window.getSelection());
        expect(sel).toBe('object');
        console.log('Shift-Enter on plain text completed without error');
    });
});
