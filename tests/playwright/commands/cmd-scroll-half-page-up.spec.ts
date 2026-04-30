import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_scroll_half_page_up (Playwright)', () => {
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
        // Scroll near bottom (but not absolute bottom) so both scrolls have room
        await page.evaluate(() => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo(0, Math.max(500, max - 100));
        });
        await page.waitForTimeout(200);
    });

    test('pressing e key scrolls page up by half page', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBeGreaterThan(0);

        const result = await sendKeyAndWaitForScroll(page, 'e', { direction: 'up', minDelta: 100 });

        expect(result.final).toBeLessThan(result.baseline);
        if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
    });

    test('scroll half page up distance is consistent', async () => {
        const result1 = await sendKeyAndWaitForScroll(page, 'e', { direction: 'up', minDelta: 100 });
        const result2 = await sendKeyAndWaitForScroll(page, 'e', { direction: 'up', minDelta: 100 });

        if (DEBUG) console.log(`1st: ${result1.delta}px, 2nd: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);
        expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(60);
    });
});
