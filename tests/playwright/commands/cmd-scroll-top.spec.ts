import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_top';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_top (Playwright)', () => {
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
        // Scroll to bottom so we can scroll up to top
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(200);
    });

    test('pressing gg scrolls to top', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBeGreaterThan(0);

            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('g');

            await page.waitForFunction(() => window.scrollY <= 5, { timeout: 10000 });

            const finalScroll = await page.evaluate(() => window.scrollY);
            expect(finalScroll).toBeLessThanOrEqual(5);
            if (DEBUG) console.log(`Scroll: ${initialScroll}px → ${finalScroll}px`);
        });
    });

    test('gg moves to exactly top position', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBeGreaterThan(0);

            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('g');

            await page.waitForFunction(() => window.scrollY <= 5, { timeout: 10000 });

            const finalScroll = await page.evaluate(() => window.scrollY);
            expect(finalScroll).toBeLessThanOrEqual(5);
            if (DEBUG) console.log(`Final scroll: ${finalScroll}px (expected: 0px)`);
        });
    });
});
