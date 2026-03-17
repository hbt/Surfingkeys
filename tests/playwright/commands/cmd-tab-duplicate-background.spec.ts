import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
        });
    });
}

test.describe('cmd_tab_duplicate_background (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('yT duplicates current tab in background and stays on original', async () => {
        await page.bringToFront();
        await page.waitForTimeout(200);

        const initialTab = await getActiveTabViaSW(context);
        const beforeCount = context.pages().length;
        console.log(`yT: initial tab id=${initialTab.id}, index=${initialTab.index}, beforeCount=${beforeCount}`);

        // Listen for new page event
        const newPagePromise = context.waitForEvent('page');
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('T');
        const newPage = await newPagePromise;

        await newPage.waitForLoadState('load');
        await newPage.waitForTimeout(300);

        // Verify a new tab was created
        expect(context.pages().length).toBe(beforeCount + 1);

        // Verify the original tab is still active (key difference from yt)
        // Poll briefly since Chrome may briefly activate duplicate before switching back
        let activeTab = await getActiveTabViaSW(context);
        for (let i = 0; i < 20; i++) {
            if (activeTab.id === initialTab.id) break;
            await page.waitForTimeout(50);
            activeTab = await getActiveTabViaSW(context);
        }

        expect(activeTab.id).toBe(initialTab.id);
        console.log(`yT: original tab ${initialTab.id} is still active`);

        // Verify duplicate has same URL
        expect(newPage.url()).toBe(page.url());
        console.log(`yT: duplicate tab URL matches original`);

        // Cleanup duplicate
        await newPage.close().catch(() => {});
    });

    test('yT twice creates two duplicates and stays on original', async () => {
        await page.bringToFront();
        await page.waitForTimeout(200);

        const initialTab = await getActiveTabViaSW(context);
        const beforeCount = context.pages().length;

        // First yT
        const dup1Promise = context.waitForEvent('page');
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('T');
        const dup1 = await dup1Promise;
        await dup1.waitForLoadState('load');
        await dup1.waitForTimeout(200);

        // Verify still on original after first
        let activeTab = await getActiveTabViaSW(context);
        for (let i = 0; i < 20; i++) {
            if (activeTab.id === initialTab.id) break;
            await page.waitForTimeout(50);
            activeTab = await getActiveTabViaSW(context);
        }
        expect(activeTab.id).toBe(initialTab.id);
        console.log(`yT x1: still on original tab ${initialTab.id}`);

        // Second yT
        await page.bringToFront();
        await page.waitForTimeout(200);
        const dup2Promise = context.waitForEvent('page');
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('T');
        const dup2 = await dup2Promise;
        await dup2.waitForLoadState('load');
        await dup2.waitForTimeout(200);

        // Verify still on original after second
        activeTab = await getActiveTabViaSW(context);
        for (let i = 0; i < 20; i++) {
            if (activeTab.id === initialTab.id) break;
            await page.waitForTimeout(50);
            activeTab = await getActiveTabViaSW(context);
        }
        expect(activeTab.id).toBe(initialTab.id);
        console.log(`yT x2: still on original tab ${initialTab.id}`);

        expect(context.pages().length).toBe(beforeCount + 2);

        await dup1.close().catch(() => {});
        await dup2.close().catch(() => {});
    });

    test('yT creates a duplicate with the same URL', async () => {
        await page.bringToFront();
        await page.waitForTimeout(200);

        const currentUrl = page.url();
        const beforeCount = context.pages().length;

        const newPagePromise = context.waitForEvent('page');
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('T');
        const newPage = await newPagePromise;

        await newPage.waitForLoadState('load');
        await newPage.waitForTimeout(300);

        expect(context.pages().length).toBe(beforeCount + 1);
        expect(newPage.url()).toBe(currentUrl);
        console.log(`yT duplicate URL: ${newPage.url()}`);

        await newPage.close().catch(() => {});
    });
});
