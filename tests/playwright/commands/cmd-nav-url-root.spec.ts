import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const BASE_ORIGIN = 'http://127.0.0.1:9873';

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_nav_url_root (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_nav_url_root');
        await cov?.close();
        await context?.close();
    });

    test('pressing gU navigates to origin root', async () => {
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

    test('gU from URL with query and hash navigates to root', async () => {
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
