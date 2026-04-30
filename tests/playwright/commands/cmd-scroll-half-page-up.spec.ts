import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_half_page_up';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_half_page_up (Playwright)', () => {
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
        // Scroll near bottom (but not absolute bottom) so both scrolls have room
        await page.evaluate(() => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo(0, Math.max(500, max - 100));
        });
        await page.waitForTimeout(200);
    });

    test('pressing e key scrolls page up by half page', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBeGreaterThan(0);

            const result = await sendKeyAndWaitForScroll(page, 'e', { direction: 'up', minDelta: 100 });

            expect(result.final).toBeLessThan(result.baseline);
            if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
        });
    });

    test('scroll half page up distance is consistent', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const result1 = await sendKeyAndWaitForScroll(page, 'e', { direction: 'up', minDelta: 100 });
            const result2 = await sendKeyAndWaitForScroll(page, 'e', { direction: 'up', minDelta: 100 });

            if (DEBUG) console.log(`1st: ${result1.delta}px, 2nd: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);
            expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(60);
        });
    });
});
