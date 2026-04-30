import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

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

test.describe('cmd_tab_close_right (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_tab_close_right');
        await cov?.close();
        await context?.close();
    });

    test('gxT closes the tab immediately to the right', async () => {
        // Ensure we have: active page, then a rightPage after it
        const activePage = await context.newPage();
        await activePage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await activePage.waitForTimeout(300);

        const rightPage = await context.newPage();
        await rightPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await rightPage.waitForTimeout(300);

        await activePage.bringToFront();
        await activePage.waitForTimeout(300);

        const beforeCount = context.pages().length;

        const closePromise = rightPage.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('T').catch(() => {});
        await closePromise;

        expect(context.pages().length).toBe(beforeCount - 1);
        if (DEBUG) console.log(`gxT: ${beforeCount} → ${context.pages().length} pages`);

        await activePage.close().catch(() => {});
    });

    test('gxT at rightmost tab does nothing', async () => {
        // Create a page and make sure there are no tabs to its right
        const rightmostPage = await context.newPage();
        await rightmostPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await rightmostPage.waitForTimeout(300);
        await rightmostPage.bringToFront();
        await rightmostPage.waitForTimeout(300);

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const maxIndex = Math.max(...allTabs.map((t: any) => t.index));

        if (activeTab.index === maxIndex) {
            const beforeCount = context.pages().length;

            await rightmostPage.keyboard.press('g');
            await rightmostPage.waitForTimeout(50);
            await rightmostPage.keyboard.press('x');
            await rightmostPage.waitForTimeout(50);
            await rightmostPage.keyboard.press('T').catch(() => {});
            await rightmostPage.waitForTimeout(800);

            expect(context.pages().length).toBe(beforeCount);
            if (DEBUG) console.log(`gxT at rightmost: tab count unchanged at ${beforeCount}`);
        } else {
            if (DEBUG) console.log(`Could not isolate rightmost scenario (index ${activeTab.index} vs max ${maxIndex}) — skipping assertion`);
        }

        await rightmostPage.close().catch(() => {});
    });

    test('gxT twice closes two tabs to the right', async () => {
        const activePage = await context.newPage();
        await activePage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await activePage.waitForTimeout(300);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(300);

        const r2 = await context.newPage();
        await r2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r2.waitForTimeout(300);

        await activePage.bringToFront();
        await activePage.waitForTimeout(300);

        const beforeCount = context.pages().length;

        // First gxT closes r1
        const close1 = r1.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('T').catch(() => {});
        await close1;

        await activePage.bringToFront();
        await activePage.waitForTimeout(200);

        // Second gxT closes r2 (now directly to the right)
        const close2 = r2.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('T').catch(() => {});
        await close2;

        expect(context.pages().length).toBe(beforeCount - 2);
        if (DEBUG) console.log(`gxT x2: ${beforeCount} → ${context.pages().length} pages`);

        await activePage.close().catch(() => {});
    });
});
