import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_left';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_left (Playwright)', () => {
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
        // Scroll far right so we can test scrolling left
        await page.evaluate(() => window.scrollTo(10000, 0));
        await page.waitForTimeout(200);
    });

    test('pressing h key scrolls page left', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScrollX = await page.evaluate(() => window.scrollX);
            expect(initialScrollX).toBeGreaterThan(0);

            const result = await sendKeyAndWaitForScroll(page, 'h', { direction: 'left', minDelta: 20 });

            expect(result.final).toBeLessThan(result.baseline);
            if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
        });
    });

    test('multiple scroll left operations work', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const start = await page.evaluate(() => window.scrollX);
            expect(start).toBeGreaterThan(0);

            const result1 = await sendKeyAndWaitForScroll(page, 'h', { direction: 'left', minDelta: 10 });
            expect(result1.final).toBeLessThan(result1.baseline);

            if (result1.final > 0) {
                const result2 = await sendKeyAndWaitForScroll(page, 'h', { direction: 'left', minDelta: 5, timeoutMs: 2000 });
                expect(result2.final).toBeLessThanOrEqual(result2.baseline);
                if (DEBUG) console.log(`Multiple: ${start}px → ${result1.final}px → ${result2.final}px`);
            } else if (DEBUG) {
                console.log(`Single scroll reached left edge: ${start}px → ${result1.final}px`);
            }
        });
    });
});
