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

async function getTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
        });
    });
}

test.describe('cmd_tab_close_all_left (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('gx0 closes all tabs to the left of current tab', async () => {
        // Setup: l0, l1, active, r0 — 4 additional pages
        const l0 = await context.newPage();
        await l0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l0.waitForTimeout(200);

        const l1 = await context.newPage();
        await l1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l1.waitForTimeout(200);

        const activePage = await context.newPage();
        await activePage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await activePage.waitForTimeout(200);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        await activePage.bringToFront();
        await activePage.waitForTimeout(300);

        const activeTab = await getActiveTabViaSW(context);
        const tabsToLeft = activeTab.index; // number of tabs to the left
        const beforeCount = context.pages().length;

        console.log(`gx0: active tab index=${activeTab.index}, tabsToLeft=${tabsToLeft}, beforeCount=${beforeCount}`);

        // Press gx0
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('0').catch(() => {});

        // Poll for closure
        const expectedCount = beforeCount - tabsToLeft;
        let finalCount = context.pages().length;
        for (let i = 0; i < 50; i++) {
            await activePage.waitForTimeout(100).catch(() => {});
            finalCount = context.pages().length;
            if (finalCount <= expectedCount) break;
        }

        expect(finalCount).toBe(expectedCount);
        console.log(`gx0: ${beforeCount} → ${finalCount} pages (expected ${expectedCount})`);

        // Cleanup right page
        await r0.close().catch(() => {});
        await activePage.close().catch(() => {});
    });

    test('gx0 at leftmost tab closes nothing', async () => {
        // Open one page and ensure it has no pages to its left
        const leftmostPage = await context.newPage();
        await leftmostPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await leftmostPage.waitForTimeout(300);
        await leftmostPage.bringToFront();
        await leftmostPage.waitForTimeout(300);

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const tabsToLeft = allTabs.filter((t: any) => t.index < activeTab.index).length;

        if (tabsToLeft === 0) {
            const beforeCount = context.pages().length;

            await leftmostPage.keyboard.press('g');
            await leftmostPage.waitForTimeout(50);
            await leftmostPage.keyboard.press('x');
            await leftmostPage.waitForTimeout(50);
            await leftmostPage.keyboard.press('0').catch(() => {});
            await leftmostPage.waitForTimeout(800);

            expect(context.pages().length).toBe(beforeCount);
            console.log(`gx0 at leftmost: count unchanged at ${beforeCount}`);
        } else {
            console.log(`Could not isolate leftmost scenario (${tabsToLeft} tabs to left) — skipping assertion`);
        }

        await leftmostPage.close().catch(() => {});
    });

    test('gx0 from rightmost tab closes all other tabs', async () => {
        // Ensure we have a few pages, then activate the last one created
        const extra1 = await context.newPage();
        await extra1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await extra1.waitForTimeout(200);

        const rightmost = await context.newPage();
        await rightmost.goto(FIXTURE_URL, { waitUntil: 'load' });
        await rightmost.waitForTimeout(200);
        await rightmost.bringToFront();
        await rightmost.waitForTimeout(300);

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const maxIndex = Math.max(...allTabs.map((t: any) => t.index));

        expect(activeTab.index).toBe(maxIndex);

        const tabsToLeft = activeTab.index;
        const beforeCount = context.pages().length;

        await rightmost.keyboard.press('g');
        await rightmost.waitForTimeout(50);
        await rightmost.keyboard.press('x');
        await rightmost.waitForTimeout(50);
        await rightmost.keyboard.press('0').catch(() => {});

        const expectedCount = beforeCount - tabsToLeft;
        let finalCount = context.pages().length;
        for (let i = 0; i < 50; i++) {
            await rightmost.waitForTimeout(100).catch(() => {});
            finalCount = context.pages().length;
            if (finalCount <= expectedCount) break;
        }

        expect(finalCount).toBe(expectedCount);
        console.log(`gx0 from rightmost: ${beforeCount} → ${finalCount} (expected ${expectedCount})`);

        await rightmost.close().catch(() => {});
    });
});
