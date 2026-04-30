import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;

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

// Open a child tab via service worker so openerTabId is set properly
async function openChildTabViaSW(ctx: BrowserContext, openerTabId: number, url: string): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(({ openerTabId, url }) => {
        return new Promise<number>((resolve) => {
            chrome.tabs.create({ url, openerTabId, active: false }, (tab: any) => resolve(tab.id));
        });
    }, { openerTabId, url });
}

// Poll until page count reaches expected value (max 5s)
async function waitForTabCount(activePage: Page, expected: number) {
    const ctx = activePage.context();
    for (let i = 0; i < 50; i++) {
        await activePage.waitForTimeout(100).catch(() => {});
        if (ctx.pages().length <= expected) break;
    }
}

// Press a multi-key sequence on the given page
async function pressKeys(page: Page, keys: string[]) {
    for (const key of keys) {
        await page.keyboard.press(key).catch(() => {});
        await page.waitForTimeout(50);
    }
}

test.describe('cmd_tab_magic_close (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        // Ensure at least one fixture page exists
        const p = await context.newPage();
        await p.goto(FIXTURE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    // Close all pages except the given one
    async function closeAllExcept(keepPage: Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) {
                await p.close().catch(() => {});
            }
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('gxe closes 1 tab to the right', async () => {
        // Create a fresh anchor page
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Open 2 tabs to the right
        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);

        const beforeCount = context.pages().length; // should be 3
        expect(beforeCount).toBeGreaterThanOrEqual(3);

        // gxe — close 1 tab to the right
        await pressKeys(anchor, ['g', 'x', 'e']);

        await waitForTabCount(anchor, beforeCount - 1);

        expect(context.pages().length).toBe(beforeCount - 1);
        console.log(`gxe: ${beforeCount} → ${context.pages().length} pages`);
    });

    test('gxq closes 1 tab to the left', async () => {
        // Create fresh pages
        const base = await context.newPage();
        await base.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(base);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        // Activate the rightmost page
        await r1.bringToFront();
        await r1.waitForTimeout(300);

        const beforeCount = context.pages().length; // should be 3

        // gxq — close 1 tab to the left
        await pressKeys(r1, ['g', 'x', 'q']);

        await waitForTabCount(r1, beforeCount - 1);

        expect(context.pages().length).toBe(beforeCount - 1);
        console.log(`gxq: ${beforeCount} → ${context.pages().length} pages`);
    });

    test('gxc closes all tabs except current', async () => {
        // Create fresh anchor
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Open 3 more tabs
        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
        }

        // Activate middle tab
        const pages = context.pages();
        const keeper = pages[Math.floor(pages.length / 2)];
        await keeper.bringToFront();
        await keeper.waitForTimeout(300);

        const beforeCount = context.pages().length;

        // gxc — close all except keeper
        await pressKeys(keeper, ['g', 'x', 'c']);

        await waitForTabCount(keeper, 1);

        expect(context.pages().length).toBe(1);
        console.log(`gxc: ${beforeCount} → ${context.pages().length} pages`);
    });

    test('gxk closes only child tabs, leaves siblings', async () => {
        // Create fresh parent tab
        const parent = await context.newPage();
        await parent.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(parent);

        // Open 2 sibling tabs (no openerTabId, just context.newPage())
        const sibling1 = await context.newPage();
        await sibling1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await sibling1.waitForTimeout(200);

        const sibling2 = await context.newPage();
        await sibling2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await sibling2.waitForTimeout(200);

        // Bring parent to front to get its tab ID
        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const parentTab = await getActiveTabViaSW(context);

        // Open 2 child tabs via service worker with openerTabId set
        const childUrl = `${FIXTURE_BASE}/scroll-test.html`;
        const child1Id = await openChildTabViaSW(context, parentTab.id, childUrl);
        const child2Id = await openChildTabViaSW(context, parentTab.id, childUrl);

        // Wait for child tabs to load
        await parent.waitForTimeout(600);

        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const beforeCount = context.pages().length;
        const allTabs = await getTabsViaSW(context);
        const childTabs = allTabs.filter((t: any) => t.openerTabId === parentTab.id);

        console.log(`gxk: beforeCount=${beforeCount}, childTabs=${childTabs.length}, siblings=2`);
        expect(childTabs.length).toBe(2);

        // gxk — close only child tabs
        await pressKeys(parent, ['g', 'x', 'k']);

        await waitForTabCount(parent, beforeCount - 2);

        const afterCount = context.pages().length;
        expect(afterCount).toBe(beforeCount - 2);

        // Verify child tab IDs are gone
        const remainingTabs = await getTabsViaSW(context);
        const remainingIds = new Set(remainingTabs.map((t: any) => t.id));
        expect(remainingIds.has(child1Id)).toBe(false);
        expect(remainingIds.has(child2Id)).toBe(false);

        console.log(`gxk: ${beforeCount} → ${afterCount} pages (removed ${beforeCount - afterCount} children)`);
    });

    test('2gxe closes 2 tabs to the right (repeat count)', async () => {
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Open 3 tabs to the right
        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
        }

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);

        const beforeCount = context.pages().length; // 4
        expect(beforeCount).toBeGreaterThanOrEqual(4);

        // 2gxe — close 2 tabs to the right
        await pressKeys(anchor, ['2', 'g', 'x', 'e']);

        await waitForTabCount(anchor, beforeCount - 2);

        expect(context.pages().length).toBe(beforeCount - 2);
        console.log(`2gxe: ${beforeCount} → ${context.pages().length} pages`);
    });
});
