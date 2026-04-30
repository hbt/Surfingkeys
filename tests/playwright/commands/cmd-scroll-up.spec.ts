import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let swCoverage: ServiceWorkerCoverage | undefined;

test.describe('cmd_scroll_up (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        swCoverage = await result.covInit();
    });

    test.beforeEach(async () => {
        // Scroll to near bottom so there is room to scroll up.
        await page.evaluate(() => {
            window.scrollTo(
                0,
                Math.max(
                    500,
                    document.body.scrollHeight - window.innerHeight - 200,
                ),
            );
        });
        await page.waitForTimeout(200);
    });

    test.afterAll(async () => {
        await swCoverage?.close();
        await context?.close();
    });

    test('pressing k key scrolls page up', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBeGreaterThan(0);

        await swCoverage?.snapshot();
        const result = await sendKeyAndWaitForScroll(page, 'k', { direction: 'up', minDelta: 20 });
        if (swCoverage) printCoverageDelta(await swCoverage.delta(), 'cmd_scroll_up');

        expect(result.final).toBeLessThan(result.baseline);
        if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
    });

    test('scroll up distance is consistent', async () => {
        const start = await page.evaluate(() => window.scrollY);
        expect(start).toBeGreaterThan(0);

        await swCoverage?.snapshot();
        const result1 = await sendKeyAndWaitForScroll(page, 'k', { direction: 'up', minDelta: 20 });
        const result2 = await sendKeyAndWaitForScroll(page, 'k', { direction: 'up', minDelta: 20 });
        if (swCoverage) printCoverageDelta(await swCoverage.delta(), 'cmd_scroll_up x2');

        if (DEBUG) console.log(`1st: ${result1.delta}px, 2nd: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);
        expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(15);
    });
});
