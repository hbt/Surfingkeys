import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_leftmost';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_leftmost (Playwright)', () => {
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
        // Scroll far right so we can test scrolling to leftmost
        await page.evaluate(() => window.scrollTo(10000, 0));
        await page.waitForTimeout(300);
    });

    test('pressing 0 scrolls to leftmost', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScrollX = await page.evaluate(() => window.scrollX);
            expect(initialScrollX).toBeGreaterThan(0);

            await page.keyboard.press('0');
            await page.waitForFunction(() => window.scrollX < 10, { timeout: 5000 });

            const finalScrollX = await page.evaluate(() => window.scrollX);
            expect(finalScrollX).toBe(0);
            if (DEBUG) console.log(`Horizontal: ${initialScrollX}px → ${finalScrollX}px`);
        });
    });

    test('0 moves to exactly leftmost position', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const start = await page.evaluate(() => window.scrollX);
            expect(start).toBeGreaterThan(0);

            await page.keyboard.press('0');
            await page.waitForFunction(() => window.scrollX < 10, { timeout: 5000 });

            const finalScrollX = await page.evaluate(() => window.scrollX);
            expect(finalScrollX).toBe(0);
            if (DEBUG) console.log(`Leftmost: ${start}px → ${finalScrollX}px`);
        });
    });
});
