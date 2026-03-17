import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_scroll_rightmost (Playwright)', () => {
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
        await page.waitForTimeout(200);
    });

    test('pressing $ scrolls to rightmost', async () => {
        const initialScrollX = await page.evaluate(() => window.scrollX);
        expect(initialScrollX).toBe(0);
        const maxScrollX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

        await page.keyboard.press('$');

        // Poll until scrollX is near rightmost (handles both instant and animated scroll)
        await page.waitForFunction(
            (max) => Math.abs(window.scrollX - max) < 30,
            maxScrollX,
            { timeout: 5000 },
        );

        const finalScrollX = await page.evaluate(() => window.scrollX);
        console.log(`Horizontal: ${initialScrollX}px → ${finalScrollX}px (max: ${maxScrollX}px)`);
        expect(finalScrollX).toBeGreaterThan(initialScrollX);
        expect(Math.abs(finalScrollX - maxScrollX)).toBeLessThan(30);
    });

    test('$ moves to exactly rightmost position', async () => {
        const maxScrollX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

        await page.keyboard.press('$');

        await page.waitForFunction(
            (max) => Math.abs(window.scrollX - max) < 30,
            maxScrollX,
            { timeout: 5000 },
        );

        const finalScrollX = await page.evaluate(() => window.scrollX);
        console.log(`Rightmost: ${finalScrollX}px / ${maxScrollX}px (delta: ${Math.abs(finalScrollX - maxScrollX)}px)`);
        expect(Math.abs(finalScrollX - maxScrollX)).toBeLessThan(30);
    });
});
