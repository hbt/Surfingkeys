import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/next-link-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_nav_next_link (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_nav_next_link');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        // Navigate back to the fixture page before each test
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test('pressing ]] navigates to next link page', async () => {
        const initialUrl = page.url();
        expect(initialUrl).toContain('next-link-test.html');

        // next-link-test.html has <a href="page2.html" id="next-link">next</a>
        const navPromise = page.waitForURL('**/page2.html', { timeout: 10000 });

        await page.keyboard.press(']');
        await page.waitForTimeout(50);
        await page.keyboard.press(']');

        await navPromise;

        const finalUrl = page.url();
        expect(finalUrl).toContain('page2.html');
        if (DEBUG) console.log(`]] navigated: ${initialUrl} → ${finalUrl}`);
    });

    test('pressing ]] clicks the next link element', async () => {
        // Verify the next-link element exists
        const nextLinkExists = await page.evaluate(() => {
            return document.getElementById('next-link') !== null;
        });
        expect(nextLinkExists).toBe(true);

        // Listen for the click event on the next-link element
        const clickedPromise = page.evaluate(() => {
            return new Promise<boolean>((resolve) => {
                const el = document.getElementById('next-link');
                if (!el) { resolve(false); return; }
                el.addEventListener('click', () => resolve(true), { once: true });
                setTimeout(() => resolve(false), 5000);
            });
        });

        await page.keyboard.press(']');
        await page.waitForTimeout(50);
        await page.keyboard.press(']');

        const clicked = await clickedPromise;
        expect(clicked).toBe(true);
        if (DEBUG) console.log('next-link element was clicked by ]] command');
    });

    test('no navigation occurs when no next link is present', async () => {
        // Overwrite page body to remove any next links
        await page.evaluate(() => {
            document.body.innerHTML = '<h1>No Next Link</h1><p>Plain content only.</p>';
        });
        await page.waitForTimeout(200);

        const urlBefore = page.url();

        await page.keyboard.press(']');
        await page.waitForTimeout(50);
        await page.keyboard.press(']');

        // Wait to ensure no navigation happens
        await page.waitForTimeout(1000);

        const urlAfter = page.url();
        expect(urlAfter).toBe(urlBefore);
        if (DEBUG) console.log('No navigation occurred when next link was absent');
    });
});
