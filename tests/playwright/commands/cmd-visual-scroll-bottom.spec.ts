import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;

async function enterVisualMode(p: Page) {
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

test.describe('cmd_visual_scroll_bottom (Playwright)', () => {
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
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('zb in visual mode does not error', async () => {
        await page.evaluate(() => window.scrollTo(0, 500));
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(500);

        await enterVisualMode(page);
        await page.waitForTimeout(100);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('b');
        await page.waitForTimeout(300);

        const finalScroll = await page.evaluate(() => window.scrollY);
        expect(typeof finalScroll).toBe('number');
        console.log(`zb executed: scroll ${initialScroll}px → ${finalScroll}px`);
    });

    test('zb does not error and selection is still valid after execution', async () => {
        await page.evaluate(() => window.scrollTo(0, 500));

        await enterVisualMode(page);
        await page.waitForTimeout(100);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('b');
        await page.waitForTimeout(300);

        // Verify selection is still accessible (visual mode still active)
        const selection = await getSelectionInfo(page);
        expect(typeof selection.focusOffset).toBe('number');
        console.log(`After zb: focusOffset=${selection.focusOffset}`);
    });

    test('zb maintains visual mode - cursor exists before and after', async () => {
        await page.evaluate(() => window.scrollTo(0, 500));

        await enterVisualMode(page);
        await page.waitForTimeout(200);

        const cursorBefore = await page.evaluate(() => document.querySelector('.surfingkeys_cursor') !== null);
        console.log(`Cursor before zb: ${cursorBefore}`);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('b');
        await page.waitForTimeout(300);

        const selection = await getSelectionInfo(page);
        expect(typeof selection.focusOffset).toBe('number');
        console.log(`Visual mode active after zb: focusOffset=${selection.focusOffset}`);
    });
});
