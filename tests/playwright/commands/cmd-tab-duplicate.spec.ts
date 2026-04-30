import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_duplicate';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_tab_duplicate (Playwright)', () => {
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

    test('pressing yt duplicates current tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const beforeCount = context.pages().length;
            const currentUrl = page.url();

            const newPagePromise = context.waitForEvent('page');
            await page.keyboard.press('y');
            await page.waitForTimeout(50);
            await page.keyboard.press('t');
            const newPage = await newPagePromise;

            await newPage.waitForLoadState('load');
            await newPage.waitForTimeout(300);

            expect(context.pages().length).toBeGreaterThan(beforeCount);
            // Duplicated tab should have the same URL
            expect(newPage.url()).toBe(currentUrl);
            if (DEBUG) console.log(`Duplicated tab: ${newPage.url()}`);

            await newPage.close().catch(() => {});
        });
    });

    test('pressing yt twice creates two duplicates', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const beforeCount = context.pages().length;

            const dup1Promise = context.waitForEvent('page');
            await page.keyboard.press('y');
            await page.waitForTimeout(50);
            await page.keyboard.press('t');
            const dup1 = await dup1Promise;
            await dup1.waitForLoadState('load');
            await dup1.waitForTimeout(200);

            await page.bringToFront();
            await page.waitForTimeout(300);

            const dup2Promise = context.waitForEvent('page');
            await page.keyboard.press('y');
            await page.waitForTimeout(50);
            await page.keyboard.press('t');
            const dup2 = await dup2Promise;
            await dup2.waitForLoadState('load');
            await dup2.waitForTimeout(200);

            expect(context.pages().length).toBeGreaterThan(beforeCount + 1);
            if (DEBUG) console.log(`After 2x yt: ${context.pages().length} pages`);

            await dup1.close().catch(() => {});
            await dup2.close().catch(() => {});
        });
    });
});
