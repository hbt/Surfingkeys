import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_nav_remove_query';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_nav_remove_query (Playwright)', () => {
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

    test('pressing g? removes query string from URL', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Navigate to URL with query
            await page.goto(`${FIXTURE_URL}?foo=bar&baz=qux`, { waitUntil: 'load' });
            await page.waitForTimeout(500);

            const urlBefore = page.url();
            expect(urlBefore).toContain('?foo=bar');

            // g? triggers full page reload to URL without query
            const loadPromise = page.waitForLoadState('load');
            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('?');
            await loadPromise;
            await page.waitForTimeout(500);

            const urlAfter = page.url();
            expect(urlAfter).toBe(FIXTURE_URL);
            expect(urlAfter).not.toContain('?');
            if (DEBUG) console.log(`Remove query: ${urlBefore} → ${urlAfter}`);
        });
    });

    test('g? removes all multiple query parameters', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Navigate to URL with multiple params
            await page.goto(`${FIXTURE_URL}?p1=v1&p2=v2&p3=v3`, { waitUntil: 'load' });
            await page.waitForTimeout(500);

            const urlBefore = page.url();
            expect(urlBefore).toContain('?p1=v1');

            const loadPromise = page.waitForLoadState('load');
            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('?');
            await loadPromise;
            await page.waitForTimeout(500);

            const urlAfter = page.url();
            expect(urlAfter).toBe(FIXTURE_URL);
            expect(urlAfter).not.toContain('?');
            expect(urlAfter).not.toContain('p1');
            expect(urlAfter).not.toContain('p2');
            if (DEBUG) console.log(`Remove all params: ${urlBefore} → ${urlAfter}`);
        });
    });

    test('g? on URL with only hash leaves hash unchanged', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Navigate to URL with only a hash (no query)
            await page.goto(`${FIXTURE_URL}#section2`, { waitUntil: 'load' });
            await page.waitForTimeout(500);

            const urlBefore = page.url();
            expect(urlBefore).toContain('#section2');
            expect(urlBefore).not.toContain('?');

            // g? with no query — no navigation occurs (URL.replace returns same href)
            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('?');
            await page.waitForTimeout(500);

            const urlAfter = page.url();
            expect(urlAfter).toContain('#section2');
            if (DEBUG) console.log(`No-op g? (no query, hash preserved): ${urlAfter}`);
        });
    });
});
