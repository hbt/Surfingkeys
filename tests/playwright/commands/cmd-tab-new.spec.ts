import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_new';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_tab_new (Playwright)', () => {
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

    test('pressing on creates a new tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const beforeCount = context.pages().length;

            const newPagePromise = context.waitForEvent('page');
            await page.keyboard.press('o');
            await page.waitForTimeout(50);
            await page.keyboard.press('n');
            const newPage = await newPagePromise;

            await newPage.waitForTimeout(300);
            expect(context.pages().length).toBeGreaterThan(beforeCount);
            if (DEBUG) console.log(`New tab opened: ${newPage.url()} (total: ${context.pages().length})`);

            // Cleanup extra tab
            if (newPage !== page) await newPage.close();
        });
    });

    test('pressing on twice creates two new tabs', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const beforeCount = context.pages().length;

            const page1Promise = context.waitForEvent('page');
            await page.keyboard.press('o');
            await page.waitForTimeout(50);
            await page.keyboard.press('n');
            const p1 = await page1Promise;

            // Press on again (need to focus back on original page first)
            await page.bringToFront();
            await page.waitForTimeout(300);

            const page2Promise = context.waitForEvent('page');
            await page.keyboard.press('o');
            await page.waitForTimeout(50);
            await page.keyboard.press('n');
            const p2 = await page2Promise;

            await p2.waitForTimeout(300);
            expect(context.pages().length).toBeGreaterThan(beforeCount + 1);
            if (DEBUG) console.log(`After 2x on: total ${context.pages().length} pages`);

            // Cleanup
            await p1.close().catch(() => {});
            await p2.close().catch(() => {});
        });
    });
});
