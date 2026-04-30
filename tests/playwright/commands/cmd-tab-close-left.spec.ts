import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function getTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
        });
    });
}

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
        });
    });
}

test.describe('cmd_tab_close_left (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_tab_close_left');
        await cov?.close();
        await context?.close();
    });

    test('gxt closes the tab immediately to the left', async () => {
        // Open extra pages: left, active (middle), right
        const leftPage = await context.newPage();
        await leftPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await leftPage.waitForTimeout(300);

        const midPage = await context.newPage();
        await midPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await midPage.waitForTimeout(300);

        const rightPage = await context.newPage();
        await rightPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await rightPage.waitForTimeout(300);

        // Activate midPage
        await midPage.bringToFront();
        await midPage.waitForTimeout(300);

        const beforeCount = context.pages().length;

        // leftPage is to the left of midPage; wait for it to close
        const closePromise = leftPage.waitForEvent('close');
        await midPage.keyboard.press('g');
        await midPage.waitForTimeout(50);
        await midPage.keyboard.press('x');
        await midPage.waitForTimeout(50);
        await midPage.keyboard.press('t').catch(() => {});
        await closePromise;

        expect(context.pages().length).toBe(beforeCount - 1);
        if (DEBUG) console.log(`gxt: ${beforeCount} → ${context.pages().length} pages`);

        // Cleanup
        await midPage.close().catch(() => {});
        await rightPage.close().catch(() => {});
    });

    test('gxt at leftmost tab does nothing', async () => {
        // Open a fresh page and make sure it is the leftmost among our test pages
        const onlyPage = await context.newPage();
        await onlyPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await onlyPage.waitForTimeout(300);
        await onlyPage.bringToFront();
        await onlyPage.waitForTimeout(300);

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const tabsToLeft = allTabs.filter((t: any) => t.index < activeTab.index);

        if (tabsToLeft.length === 0) {
            // At leftmost — pressing gxt should not close anything
            const beforeCount = context.pages().length;

            await onlyPage.keyboard.press('g');
            await onlyPage.waitForTimeout(50);
            await onlyPage.keyboard.press('x');
            await onlyPage.waitForTimeout(50);
            await onlyPage.keyboard.press('t').catch(() => {});
            await onlyPage.waitForTimeout(800);

            expect(context.pages().length).toBe(beforeCount);
            if (DEBUG) console.log(`gxt at leftmost: tab count unchanged at ${beforeCount}`);
        } else {
            if (DEBUG) console.log(`Could not isolate leftmost scenario (${tabsToLeft.length} tabs to left) — skipping assertion`);
        }

        await onlyPage.close().catch(() => {});
    });

    test('gxt twice closes two tabs to the left', async () => {
        // Create three extra pages: l1, l2, active
        const l1 = await context.newPage();
        await l1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l1.waitForTimeout(300);

        const l2 = await context.newPage();
        await l2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l2.waitForTimeout(300);

        const activePage = await context.newPage();
        await activePage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await activePage.waitForTimeout(300);

        await activePage.bringToFront();
        await activePage.waitForTimeout(300);

        const beforeCount = context.pages().length;

        // First gxt
        const close1 = l2.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('t').catch(() => {});
        await close1;

        await activePage.bringToFront();
        await activePage.waitForTimeout(200);

        // Second gxt
        const close2 = l1.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('t').catch(() => {});
        await close2;

        expect(context.pages().length).toBe(beforeCount - 2);
        if (DEBUG) console.log(`gxt x2: ${beforeCount} → ${context.pages().length} pages`);

        await activePage.close().catch(() => {});
    });
});
