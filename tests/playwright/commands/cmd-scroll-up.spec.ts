import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_up';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_up (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
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
        await covBg?.close();
        await context?.close();
    });

    test('pressing k key scrolls page up', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBeGreaterThan(0);

            const result = await sendKeyAndWaitForScroll(page, 'k', { direction: 'up', minDelta: 20 });

            expect(result.final).toBeLessThan(result.baseline);
            if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
        });
    });

    test('scroll up distance is consistent', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const start = await page.evaluate(() => window.scrollY);
            expect(start).toBeGreaterThan(0);

            const result1 = await sendKeyAndWaitForScroll(page, 'k', { direction: 'up', minDelta: 20 });
            const result2 = await sendKeyAndWaitForScroll(page, 'k', { direction: 'up', minDelta: 20 });

            if (DEBUG) console.log(`1st: ${result1.delta}px, 2nd: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);
            expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(15);
        });
    });
});
