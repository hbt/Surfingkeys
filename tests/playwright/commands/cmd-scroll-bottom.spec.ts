import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_bottom';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_bottom (Playwright)', () => {
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

    test('pressing G scrolls to bottom', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBe(0);
            const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

            await page.keyboard.press('G');

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
    });

    test('G moves to exactly bottom position', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
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
});
