import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_tab_duplicate (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing yt duplicates current tab', async () => {
        const beforeCount = context.pages().length;
        const currentUrl = page.url();

        const newPagePromise = context.waitForEvent('page');
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('t');
        const newPage = await newPagePromise;

        await newPage.waitForLoadState('load');
        await newPage.waitForTimeout(300);

        expect(context.pages().length).toBeGreaterThan(beforeCount);
        // Duplicated tab should have the same URL
        expect(newPage.url()).toBe(currentUrl);
        console.log(`Duplicated tab: ${newPage.url()}`);

        await newPage.close().catch(() => {});
    });

    test('pressing yt twice creates two duplicates', async () => {
        const beforeCount = context.pages().length;

        const dup1Promise = context.waitForEvent('page');
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('t');
        const dup1 = await dup1Promise;
        await dup1.waitForLoadState('load');
        await dup1.waitForTimeout(200);

        await page.bringToFront();
        await page.waitForTimeout(300);

        const dup2Promise = context.waitForEvent('page');
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('t');
        const dup2 = await dup2Promise;
        await dup2.waitForLoadState('load');
        await dup2.waitForTimeout(200);

        expect(context.pages().length).toBeGreaterThan(beforeCount + 1);
        console.log(`After 2x yt: ${context.pages().length} pages`);

        await dup1.close().catch(() => {});
        await dup2.close().catch(() => {});
    });
});
