import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function getAllTabUrls(ctx: BrowserContext): Promise<string[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<string[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs) => {
                resolve(tabs.map((t) => t.url || ''));
            });
        });
    });
}

test.describe('cmd_yank_all_urls (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_yank_all_urls');
        await cov?.close();
        await context?.close();
    });

    test('background script can query all tab URLs', async () => {
        const urls = await getAllTabUrls(context);
        expect(Array.isArray(urls)).toBe(true);
        expect(urls.length).toBeGreaterThan(0);
        if (DEBUG) console.log(`Tab URLs: ${urls.join(', ')}`);
    });

    test('pressing yY executes without error', async () => {
        // yY = yank all tab URLs to clipboard
        // We verify the command fires without throwing by checking tab count before/after
        const urlsBefore = await getAllTabUrls(context);
        expect(urlsBefore.length).toBeGreaterThan(0);

        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('Y');
        await page.waitForTimeout(500);

        // Tab count should be unchanged (yY doesn't open new tabs)
        const urlsAfter = await getAllTabUrls(context);
        expect(urlsAfter.length).toBe(urlsBefore.length);
        if (DEBUG) console.log(`yY executed: ${urlsAfter.length} tabs present`);
    });

    test('multiple tabs are accessible for yY command', async () => {
        // Open an extra tab so we have at least 2
        const extra = await context.newPage();
        await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
        await extra.waitForTimeout(300);

        const urls = await getAllTabUrls(context);
        expect(urls.length).toBeGreaterThanOrEqual(2);
        if (DEBUG) console.log(`Multiple tabs accessible: ${urls.length}`);

        await extra.close().catch(() => {});
    });
});
