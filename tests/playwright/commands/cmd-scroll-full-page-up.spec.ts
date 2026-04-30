import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_scroll_full_page_up (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_scroll_full_page_up');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        // Scroll to bottom for full-page-up tests
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(200);
    });

    test('pressing U key scrolls page up by full page', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBeGreaterThan(0);

        const result = await sendKeyAndWaitForScroll(page, 'U', { direction: 'up', minDelta: 300 });

        expect(result.final).toBeLessThan(result.baseline);
        if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
    });

    test('scroll full page up distance is consistent', async () => {
        const result1 = await sendKeyAndWaitForScroll(page, 'U', { direction: 'up', minDelta: 300 });
        const result2 = await sendKeyAndWaitForScroll(page, 'U', { direction: 'up', minDelta: 300 });

        if (DEBUG) console.log(`1st: ${result1.delta}px, 2nd: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);
        expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(15);
    });
});
