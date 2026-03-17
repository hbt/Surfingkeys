import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_scroll_right (Playwright)', () => {
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

    test('pressing l key scrolls page right', async () => {
        const initialScrollX = await page.evaluate(() => window.scrollX);
        expect(initialScrollX).toBe(0);

        const result = await sendKeyAndWaitForScroll(page, 'l', { direction: 'right', minDelta: 20 });

        expect(result.final).toBeGreaterThan(result.baseline);
        console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
    });

    test('scroll right distance is consistent', async () => {
        const result1 = await sendKeyAndWaitForScroll(page, 'l', { direction: 'right', minDelta: 20 });
        const result2 = await sendKeyAndWaitForScroll(page, 'l', { direction: 'right', minDelta: 20 });

        const dist1 = result1.delta;
        const dist2 = result2.delta;
        console.log(`1st: ${dist1}px, 2nd: ${dist2}px, diff: ${Math.abs(dist1 - dist2)}px`);
        expect(Math.abs(dist1 - dist2)).toBeLessThan(15);
    });
});
