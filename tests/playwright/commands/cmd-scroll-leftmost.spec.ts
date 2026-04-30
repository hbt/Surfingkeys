import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_scroll_leftmost (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_scroll_leftmost');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        // Scroll far right so we can test scrolling to leftmost
        await page.evaluate(() => window.scrollTo(10000, 0));
        await page.waitForTimeout(300);
    });

    test('pressing 0 scrolls to leftmost', async () => {
        const initialScrollX = await page.evaluate(() => window.scrollX);
        expect(initialScrollX).toBeGreaterThan(0);

        await page.keyboard.press('0');

        // Poll until scrollX reaches 0 (handles both instant and animated scroll)
        await page.waitForFunction(() => window.scrollX < 10, { timeout: 5000 });

        const finalScrollX = await page.evaluate(() => window.scrollX);
        expect(finalScrollX).toBe(0);
        if (DEBUG) console.log(`Horizontal: ${initialScrollX}px → ${finalScrollX}px`);
    });

    test('0 moves to exactly leftmost position', async () => {
        const start = await page.evaluate(() => window.scrollX);
        expect(start).toBeGreaterThan(0);

        await page.keyboard.press('0');

        await page.waitForFunction(() => window.scrollX < 10, { timeout: 5000 });

        const finalScrollX = await page.evaluate(() => window.scrollX);
        expect(finalScrollX).toBe(0);
        if (DEBUG) console.log(`Leftmost: ${start}px → ${finalScrollX}px`);
    });
});
