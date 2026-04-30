import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_nav_url_root';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const BASE_ORIGIN = 'http://127.0.0.1:9873';

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_nav_url_root (Playwright)', () => {
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

    test('pressing gU navigates to origin root', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialUrl = page.url();
            expect(initialUrl).toContain('/scroll-test.html');

            const rootPromise = page.waitForURL(/^http:\/\/127\.0\.0\.1:9873\/?$/, { timeout: 10000 });
            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('U');
            await rootPromise;

            const finalUrl = page.url();
            expect(finalUrl.replace(/\/$/, '')).toBe(BASE_ORIGIN);
            if (DEBUG) console.log(`URL root: ${initialUrl} → ${finalUrl}`);

            // Navigate back for the next test
            await page.goto(FIXTURE_URL, { waitUntil: 'load' });
            await page.waitForTimeout(500);
        });
    });

    test('gU from URL with query and hash navigates to root', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Navigate to URL with query and hash
            await page.goto(`${FIXTURE_URL}?foo=bar#section`, { waitUntil: 'load' });
            await page.waitForTimeout(500);

            const initialUrl = page.url();
            expect(initialUrl).toContain('?foo=bar');

            const rootPromise = page.waitForURL(/^http:\/\/127\.0\.0\.1:9873\/?$/, { timeout: 10000 });
            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('U');
            await rootPromise;

            const finalUrl = page.url();
            expect(finalUrl.replace(/\/$/, '')).toBe(BASE_ORIGIN);
            if (DEBUG) console.log(`URL root from query+hash: ${initialUrl} → ${finalUrl}`);

            // Navigate back for cleanup
            await page.goto(FIXTURE_URL, { waitUntil: 'load' });
            await page.waitForTimeout(500);
        });
    });
});
