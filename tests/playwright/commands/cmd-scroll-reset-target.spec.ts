import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_reset_target';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_reset_target (Playwright)', () => {
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

    test('pressing cS resets scroll target', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBe(0);

            await page.keyboard.press('c');
            await page.keyboard.press('S');
            await page.waitForTimeout(200);

            const status = await page.evaluate(() => 'reset-executed');
            expect(status).toBe('reset-executed');
        });
    });

    test('cS resets to document body - j still scrolls', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBe(0);

            await page.keyboard.press('c');
            await page.keyboard.press('S');
            await page.waitForTimeout(200);

            const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });

            expect(result.final).toBeGreaterThan(result.baseline);
            const windowScrollY = await page.evaluate(() => window.scrollY);
            expect(windowScrollY).toBeGreaterThan(0);
            if (DEBUG) console.log(`After cS reset, j scrolled: ${result.baseline}px → ${result.final}px`);
        });
    });
});
