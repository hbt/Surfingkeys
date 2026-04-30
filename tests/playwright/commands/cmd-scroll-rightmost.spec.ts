import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_rightmost';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_rightmost (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
    });

    test('pressing $ scrolls to rightmost', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScrollX = await page.evaluate(() => window.scrollX);
            expect(initialScrollX).toBe(0);
            const maxScrollX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

            await page.keyboard.press('$');
            await page.waitForFunction(
                (max) => Math.abs(window.scrollX - max) < 30,
                maxScrollX,
                { timeout: 5000 },
            );

            const finalScrollX = await page.evaluate(() => window.scrollX);
            if (DEBUG) console.log(`Horizontal: ${initialScrollX}px → ${finalScrollX}px (max: ${maxScrollX}px)`);
            expect(finalScrollX).toBeGreaterThan(initialScrollX);
            expect(Math.abs(finalScrollX - maxScrollX)).toBeLessThan(30);
        });
    });

    test('$ moves to exactly rightmost position', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const maxScrollX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

            await page.keyboard.press('$');
            await page.waitForFunction(
                (max) => Math.abs(window.scrollX - max) < 30,
                maxScrollX,
                { timeout: 5000 },
            );

            const finalScrollX = await page.evaluate(() => window.scrollX);
            if (DEBUG) console.log(`Rightmost: ${finalScrollX}px / ${maxScrollX}px (delta: ${Math.abs(finalScrollX - maxScrollX)}px)`);
            expect(Math.abs(finalScrollX - maxScrollX)).toBeLessThan(30);
        });
    });
});
