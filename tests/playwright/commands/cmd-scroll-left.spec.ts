import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_scroll_left (Playwright)', () => {
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
        // Scroll far right so we can test scrolling left
        await page.evaluate(() => window.scrollTo(10000, 0));
        await page.waitForTimeout(200);
    });

    test('pressing h key scrolls page left', async () => {
        const initialScrollX = await page.evaluate(() => window.scrollX);
        expect(initialScrollX).toBeGreaterThan(0);

        const result = await sendKeyAndWaitForScroll(page, 'h', { direction: 'left', minDelta: 20 });

        expect(result.final).toBeLessThan(result.baseline);
        if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
    });

    test('multiple scroll left operations work', async () => {
        const start = await page.evaluate(() => window.scrollX);
        expect(start).toBeGreaterThan(0);

        const result1 = await sendKeyAndWaitForScroll(page, 'h', { direction: 'left', minDelta: 10 });
        expect(result1.final).toBeLessThan(result1.baseline);

        if (result1.final > 0) {
            const result2 = await sendKeyAndWaitForScroll(page, 'h', { direction: 'left', minDelta: 5, timeoutMs: 2000 });
            expect(result2.final).toBeLessThanOrEqual(result2.baseline);
            if (DEBUG) console.log(`Multiple: ${start}px → ${result1.final}px → ${result2.final}px`);
        } else {
            if (DEBUG) console.log(`Single scroll reached left edge: ${start}px → ${result1.final}px`);
        }
    });
});
