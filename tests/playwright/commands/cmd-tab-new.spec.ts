import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_tab_new (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing on creates a new tab', async () => {
        const beforeCount = context.pages().length;

        const newPagePromise = context.waitForEvent('page');
        await page.keyboard.press('o');
        await page.waitForTimeout(50);
        await page.keyboard.press('n');
        const newPage = await newPagePromise;

        await newPage.waitForTimeout(300);
        expect(context.pages().length).toBeGreaterThan(beforeCount);
        console.log(`New tab opened: ${newPage.url()} (total: ${context.pages().length})`);

        // Cleanup extra tab
        if (newPage !== page) await newPage.close();
    });

    test('pressing on twice creates two new tabs', async () => {
        const beforeCount = context.pages().length;

        const page1Promise = context.waitForEvent('page');
        await page.keyboard.press('o');
        await page.waitForTimeout(50);
        await page.keyboard.press('n');
        const p1 = await page1Promise;

        // Press on again (need to focus back on original page first)
        await page.bringToFront();
        await page.waitForTimeout(300);

        const page2Promise = context.waitForEvent('page');
        await page.keyboard.press('o');
        await page.waitForTimeout(50);
        await page.keyboard.press('n');
        const p2 = await page2Promise;

        await p2.waitForTimeout(300);
        expect(context.pages().length).toBeGreaterThan(beforeCount + 1);
        console.log(`After 2x on: total ${context.pages().length} pages`);

        // Cleanup
        await p1.close().catch(() => {});
        await p2.close().catch(() => {});
    });
});
