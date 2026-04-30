import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_right';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_right (Playwright)', () => {
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
        await page.waitForTimeout(100);
    });

    test('pressing l key scrolls page right', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScrollX = await page.evaluate(() => window.scrollX);
            expect(initialScrollX).toBe(0);

            const result = await sendKeyAndWaitForScroll(page, 'l', { direction: 'right', minDelta: 20 });

            expect(result.final).toBeGreaterThan(result.baseline);
            if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
        });
    });

    test('scroll right distance is consistent', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const result1 = await sendKeyAndWaitForScroll(page, 'l', { direction: 'right', minDelta: 20 });
            const result2 = await sendKeyAndWaitForScroll(page, 'l', { direction: 'right', minDelta: 20 });

            const dist1 = result1.delta;
            const dist2 = result2.delta;
            if (DEBUG) console.log(`1st: ${dist1}px, 2nd: ${dist2}px, diff: ${Math.abs(dist1 - dist2)}px`);
            expect(Math.abs(dist1 - dist2)).toBeLessThan(15);
        });
    });
});
