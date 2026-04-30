import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_scroll_bottom (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_scroll_bottom');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test('pressing G scrolls to bottom', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(0);
        const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

        await page.keyboard.press('G');

        // Wait until the scroll settles near the bottom
        await page.waitForFunction(
            (maxScroll) => Math.abs(window.scrollY - maxScroll) < 10,
            maxScroll,
            { timeout: 10000 },
        );

        const finalScroll = await page.evaluate(() => window.scrollY);
        expect(finalScroll).toBeGreaterThan(initialScroll);
        expect(Math.abs(finalScroll - maxScroll)).toBeLessThan(10);
        if (DEBUG) console.log(`Scroll: ${initialScroll}px → ${finalScroll}px (maxScroll: ${maxScroll}px)`);
    });

    test('G moves to exactly bottom position', async () => {
        const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

        await page.keyboard.press('G');

        await page.waitForFunction(
            (maxScroll) => Math.abs(window.scrollY - maxScroll) < 10,
            maxScroll,
            { timeout: 10000 },
        );

        const finalScroll = await page.evaluate(() => window.scrollY);
        if (DEBUG) console.log(`Final: ${finalScroll}px, Max: ${maxScroll}px, Diff: ${Math.abs(finalScroll - maxScroll)}px`);
        expect(Math.abs(finalScroll - maxScroll)).toBeLessThan(10);
    });
});
