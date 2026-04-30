import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const PAGE1_URL = `${FIXTURE_BASE}/nav-prev-link-page1.html`;
const PAGE2_URL = `${FIXTURE_BASE}/nav-prev-link-page2.html`;
const PAGE3_URL = `${FIXTURE_BASE}/nav-prev-link-page3.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_nav_previous_link (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(PAGE2_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(PAGE2_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_nav_previous_link');
        await cov?.close();
        await context?.close();
    });

    test('pressing [[ on page 2 navigates to page 1', async () => {
        await page.goto(PAGE2_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        const initialUrl = page.url();
        expect(initialUrl).toContain('nav-prev-link-page2.html');

        const navPromise = page.waitForURL('**/nav-prev-link-page1.html', { timeout: 10000 });

        await page.keyboard.press('[');
        await page.waitForTimeout(100);
        await page.keyboard.press('[');

        await navPromise;

        const finalUrl = page.url();
        expect(finalUrl).toContain('nav-prev-link-page1.html');
        if (DEBUG) console.log(`[[ navigated: ${initialUrl} → ${finalUrl}`);
    });

    test('pressing [[ on page 3 navigates to page 2', async () => {
        await page.goto(PAGE3_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        const initialUrl = page.url();
        expect(initialUrl).toContain('nav-prev-link-page3.html');

        const navPromise = page.waitForURL('**/nav-prev-link-page2.html', { timeout: 10000 });

        await page.keyboard.press('[');
        await page.waitForTimeout(100);
        await page.keyboard.press('[');

        await navPromise;

        const finalUrl = page.url();
        expect(finalUrl).toContain('nav-prev-link-page2.html');
        if (DEBUG) console.log(`[[ navigated: ${initialUrl} → ${finalUrl}`);
    });

    test('page 2 has rel=prev links pointing to page 1', async () => {
        await page.goto(PAGE2_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        const prevLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('[rel="prev"]')).map((el: any) => ({
                tag: el.tagName,
                href: el.getAttribute('href'),
                text: el.textContent.trim(),
            }));
        });

        if (DEBUG) console.log(`Found ${prevLinks.length} rel="prev" links:`, prevLinks);

        expect(prevLinks.length).toBeGreaterThanOrEqual(1);
        expect(prevLinks.some((l: any) => l.href && l.href.includes('page1.html'))).toBe(true);
    });
});
