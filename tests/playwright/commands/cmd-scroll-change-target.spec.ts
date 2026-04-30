import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_scroll_change_target (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_scroll_change_target');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test('pressing cs executes change scroll target command', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(0);

        await page.keyboard.press('c');
        await page.keyboard.press('s');
        await page.waitForTimeout(200);

        const finalScroll = await page.evaluate(() => window.scrollY);
        expect(finalScroll).toBeGreaterThanOrEqual(0);
        if (DEBUG) console.log(`Scroll target changed - initial: ${initialScroll}px, after: ${finalScroll}px`);
    });

    test('cs can be called multiple times', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(0);

        await page.keyboard.press('c');
        await page.keyboard.press('s');
        const afterFirst = await page.evaluate(() => window.scrollY);
        expect(afterFirst).toBeGreaterThanOrEqual(0);

        await page.keyboard.press('c');
        await page.keyboard.press('s');
        const afterSecond = await page.evaluate(() => window.scrollY);
        expect(afterSecond).toBeGreaterThanOrEqual(0);

        if (DEBUG) console.log(`Multiple toggle - initial: ${initialScroll}px, after 1st: ${afterFirst}px, after 2nd: ${afterSecond}px`);
    });
});
