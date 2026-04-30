import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_scroll_top (Playwright)', () => {
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
        // Scroll to bottom so we can scroll up to top
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(200);
    });

    test('pressing gg scrolls to top', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBeGreaterThan(0);

        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');

        // Wait until the scroll settles at the top
        await page.waitForFunction(() => window.scrollY <= 5, { timeout: 10000 });

        const finalScroll = await page.evaluate(() => window.scrollY);
        expect(finalScroll).toBeLessThanOrEqual(5);
        if (DEBUG) console.log(`Scroll: ${initialScroll}px → ${finalScroll}px`);
    });

    test('gg moves to exactly top position', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBeGreaterThan(0);

        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');

        await page.waitForFunction(() => window.scrollY <= 5, { timeout: 10000 });

        const finalScroll = await page.evaluate(() => window.scrollY);
        expect(finalScroll).toBeLessThanOrEqual(5);
        if (DEBUG) console.log(`Final scroll: ${finalScroll}px (expected: 0px)`);
    });
});
