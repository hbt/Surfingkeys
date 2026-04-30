import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
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

async function openChildTabViaSW(ctx: BrowserContext, openerTabId: number, url: string): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(({ openerTabId, url }) => {
        return new Promise<number>((resolve) => {
            chrome.tabs.create({ url, openerTabId, active: false }, (tab: any) => resolve(tab.id));
        });
    }, { openerTabId, url });
}

test.describe('cmd_tab_reload_magic (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
        const p = await context.newPage();
        await p.goto(FIXTURE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_tab_reload_magic');
        await cov?.close();
        await context?.close();
    });

    async function closeAllExcept(keepPage: import('@playwright/test').Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('cmd_tab_reload_magic_right reloads tabs to the right, tab count unchanged', async () => {
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        const r2 = await context.newPage();
        await r2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r2.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(3);

        await invokeCommand(anchor, 'cmd_tab_reload_magic_right');
        await anchor.waitForTimeout(500);

        const afterCount = context.pages().length;
        expect(afterCount).toBe(beforeCount);
        if (DEBUG) console.log(`cmd_tab_reload_magic_right: tab count ${beforeCount} → ${afterCount} (unchanged)`);
    });

    test('cmd_tab_reload_magic_left reloads tabs to the left, tab count unchanged', async () => {
        const base = await context.newPage();
        await base.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(base);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        const r2 = await context.newPage();
        await r2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r2.waitForTimeout(200);

        await r2.bringToFront();
        await r2.waitForTimeout(300);

        const beforeCount = context.pages().length;

        await invokeCommand(r2, 'cmd_tab_reload_magic_left');
        await r2.waitForTimeout(500);

        const afterCount = context.pages().length;
        expect(afterCount).toBe(beforeCount);
        if (DEBUG) console.log(`cmd_tab_reload_magic_left: tab count ${beforeCount} → ${afterCount} (unchanged)`);
    });

    test('cmd_tab_reload_magic_except_active reloads all except current, tab count unchanged', async () => {
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
        }

        const pages = context.pages();
        const keeper = pages[Math.floor(pages.length / 2)];
        await keeper.bringToFront();
        await keeper.waitForTimeout(300);

        const beforeCount = context.pages().length;
        const beforeTabIds = (await getTabsViaSW(context)).map((t: any) => t.id);

        await invokeCommand(keeper, 'cmd_tab_reload_magic_except_active');
        await keeper.waitForTimeout(600);

        const afterCount = context.pages().length;
        expect(afterCount).toBe(beforeCount);

        // Verify all tabs still exist
        const afterTabIds = (await getTabsViaSW(context)).map((t: any) => t.id);
        for (const id of beforeTabIds) {
            expect(afterTabIds).toContain(id);
        }
        if (DEBUG) console.log(`cmd_tab_reload_magic_except_active: tab count ${beforeCount} → ${afterCount} (unchanged)`);
    });

    test('cmd_tab_reload_magic_children reloads child tabs, tab count unchanged', async () => {
        const parent = await context.newPage();
        await parent.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(parent);

        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const parentTab = await getActiveTabViaSW(context);

        const child1Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
        const child2Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
        await parent.waitForTimeout(600);

        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const beforeCount = context.pages().length;
        const allTabs = await getTabsViaSW(context);
        const childTabs = allTabs.filter((t: any) => t.openerTabId === parentTab.id);
        expect(childTabs.length).toBe(2);

        await invokeCommand(parent, 'cmd_tab_reload_magic_children');
        await parent.waitForTimeout(600);

        const afterCount = context.pages().length;
        expect(afterCount).toBe(beforeCount);

        // Verify child tabs still exist
        const afterTabIds = (await getTabsViaSW(context)).map((t: any) => t.id);
        expect(afterTabIds).toContain(child1Id);
        expect(afterTabIds).toContain(child2Id);
        if (DEBUG) console.log(`cmd_tab_reload_magic_children: tab count ${beforeCount} → ${afterCount} (unchanged)`);
    });
});
