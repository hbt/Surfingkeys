import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let cov: ServiceWorkerCoverage | undefined;
let page: Page;

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a],
            bubbles: true,
            composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

test.describe('unmapAllExcept + mapcmdkey (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_unmap_all_except');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        // Reload page to reset all mappings to defaults between tests
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        await page?.close().catch(() => {});
    });

    test('j scrolls by default', async () => {
        const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        expect(result.final).toBeGreaterThan(result.baseline);
    });

    test('j silent after unmapAllExcept([])', async () => {
        await callSKApi(page, 'unmapAllExcept', []);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.keyboard.press('j').catch(() => {});
        await page.waitForTimeout(500);
        const scrollY = await page.evaluate(() => window.scrollY);
        expect(scrollY).toBe(0);
    });

    test('j scrolls after unmapAllExcept([]) + mapcmdkey("j", "cmd_scroll_down")', async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'j', 'cmd_scroll_down');

        const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        expect(result.final).toBeGreaterThan(result.baseline);
    });
});
