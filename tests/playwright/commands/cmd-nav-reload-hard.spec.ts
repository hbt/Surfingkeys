import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_nav_reload_hard';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_nav_reload_hard (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_nav_reload_hard clears injected window variable', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const marker = Date.now();
            await page.evaluate((m) => { (window as any).__reloadTestMarker = m; }, marker);
            const markerCheck = await page.evaluate(() => (window as any).__reloadTestMarker);
            expect(markerCheck).toBe(marker);

            const loadEvent = page.waitForEvent('load', { timeout: 10000 });
            const ok = await invokeCommand(page, 'cmd_nav_reload_hard');
            if (DEBUG) console.log(`[DEBUG] invokeCommand returned: ${ok}`);
            await loadEvent;
            await page.waitForTimeout(500);

            const markerAfter = await page.evaluate(() => (window as any).__reloadTestMarker);
            expect(markerAfter).toBeUndefined();
        });
    });

    // NOTE: Cache-Control: no-cache header is NOT testable via Playwright's page.route() /
    // page.on('request'). Those intercept at the CDP Fetch domain (page context level).
    // chrome.tabs.reload({ bypassCache: true }) is called from the extension service worker;
    // Chrome's network stack injects Cache-Control: no-cache after the Playwright interception
    // point. Verifying bypassCache:true is a source-level fact (see default.js cmd_nav_reload_hard).

    test('cmd_nav_reload_hard preserves page content', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const titleBefore = await page.evaluate(() => document.title);
            expect(titleBefore).toBeTruthy();

            await Promise.all([
                page.waitForURL(FIXTURE_URL, { waitUntil: 'load', timeout: 10000 }),
                invokeCommand(page, 'cmd_nav_reload_hard'),
            ]);
            await page.waitForTimeout(500);

            const titleAfter = await page.evaluate(() => document.title);
            expect(titleAfter).toBe(titleBefore);
        });
    });
});
