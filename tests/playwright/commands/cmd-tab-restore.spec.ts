import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_restore';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_tab_restore (Playwright)', () => {
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

    test('pressing X restores most recently closed tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Open a page to close
            const toClose = await context.newPage();
            await toClose.goto(FIXTURE_URL, { waitUntil: 'load' });
            await toClose.waitForTimeout(500);

            // Close it via SK
            await toClose.bringToFront();
            await toClose.waitForTimeout(200);
            const closePromise = toClose.waitForEvent('close');
            await toClose.keyboard.press('x').catch(() => {});
            await closePromise;

            const countAfterClose = context.pages().length;

            // Restore via X on the main page
            const restorePromise = context.waitForEvent('page');
            await page.keyboard.press('X');
            const restoredPage = await restorePromise;

            await restoredPage.waitForLoadState('load');
            await restoredPage.waitForTimeout(300);

            expect(context.pages().length).toBeGreaterThan(countAfterClose);
            if (DEBUG) console.log(`Restored tab: ${restoredPage.url()}`);

            await restoredPage.close().catch(() => {});
        });
    });
});
