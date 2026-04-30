import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_nav_remove_query (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_nav_remove_query');
        await cov?.close();
        await context?.close();
    });

    test('pressing g? removes query string from URL', async () => {
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

    test('g? removes all multiple query parameters', async () => {
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

    test('g? on URL with only hash leaves hash unchanged', async () => {
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
