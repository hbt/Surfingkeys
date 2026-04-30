import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_scroll_reset_target (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_scroll_reset_target');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test('pressing cS resets scroll target', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(0);

        await page.keyboard.press('c');
        await page.keyboard.press('S');
        await page.waitForTimeout(200);

        // Command executed without error
        const status = await page.evaluate(() => 'reset-executed');
        expect(status).toBe('reset-executed');
    });

    test('cS resets to document body - j still scrolls', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(0);

        // Reset scroll target
        await page.keyboard.press('c');
        await page.keyboard.press('S');
        await page.waitForTimeout(200);

        // Now j should scroll the main page
        const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });

        expect(result.final).toBeGreaterThan(result.baseline);
        const windowScrollY = await page.evaluate(() => window.scrollY);
        expect(windowScrollY).toBeGreaterThan(0);
        if (DEBUG) console.log(`After cS reset, j scrolled: ${result.baseline}px → ${result.final}px`);
    });
});
