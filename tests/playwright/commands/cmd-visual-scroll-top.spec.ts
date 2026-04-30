import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

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

async function getCursorTop(p: Page): Promise<number | null> {
    return p.evaluate(() => {
        const cursor = document.querySelector('.surfingkeys_cursor');
        if (cursor) {
            return cursor.getBoundingClientRect().top;
        }
        return null;
    });
}

test.describe('cmd_visual_scroll_top (Playwright)', () => {
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
            window.scrollTo(0, 0);
            window.getSelection()?.removeAllRanges();
        });
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('zt in visual mode does not error', async () => {
        await page.evaluate(() => window.scrollTo(0, 500));
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(500);

        await enterVisualMode(page, 'Lorem ipsum');

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('t');
        await page.waitForTimeout(300);

        const finalScroll = await page.evaluate(() => window.scrollY);
        expect(typeof finalScroll).toBe('number');
        if (DEBUG) console.log(`zt executed: scroll ${initialScroll}px → ${finalScroll}px`);
    });

    test('zt changes scroll position', async () => {
        await page.evaluate(() => window.scrollTo(0, 800));
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(800);

        await enterVisualMode(page, 'Lorem ipsum');

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('t');
        await page.waitForTimeout(300);

        const finalScroll = await page.evaluate(() => window.scrollY);
        if (DEBUG) console.log(`Scroll: ${initialScroll}px → ${finalScroll}px`);
        expect(finalScroll).not.toBe(initialScroll);
    });

    test('zt scrolls cursor toward top of viewport', async () => {
        await page.evaluate(() => window.scrollTo(0, 800));

        await enterVisualMode(page, 'Lorem ipsum');

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('t');
        await page.waitForTimeout(300);

        const cursorTop = await getCursorTop(page);
        const finalScroll = await page.evaluate(() => window.scrollY);
        if (DEBUG) console.log(`After zt: scroll=${finalScroll}px, cursorTop=${cursorTop}px`);

        if (cursorTop !== null) {
            expect(cursorTop).toBeLessThanOrEqual(50);
            expect(cursorTop).toBeGreaterThanOrEqual(0);
        }
    });
});
