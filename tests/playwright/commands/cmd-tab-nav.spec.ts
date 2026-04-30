import { test, expect, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

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

async function activateTabViaSW(ctx: BrowserContext, tabId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { active: true }, () => resolve());
        });
    }, tabId);
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

test.describe('cmd_tab_nav (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        const p = await context.newPage();
        await p.goto(FIXTURE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    async function closeAllExcept(keepPage: import('@playwright/test').Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('cmd_tab_next moves active tab from index 0 to index 1', async () => {
        const tab0 = await context.newPage();
        await tab0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(tab0);

        const tab1 = await context.newPage();
        await tab1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await tab1.waitForTimeout(200);

        const tab2 = await context.newPage();
        await tab2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await tab2.waitForTimeout(200);

        // Get tabs from SW and find index 0 tab
        const allTabs = await getTabsViaSW(context);
        expect(allTabs.length).toBe(3);
        const tab0Info = allTabs.find((t: any) => t.index === 0);
        expect(tab0Info).toBeDefined();

        // Activate index 0 via SW (reliable)
        await activateTabViaSW(context, tab0Info!.id);
        await tab0.waitForTimeout(300);

        const beforeActive = await getActiveTabViaSW(context);
        expect(beforeActive.index).toBe(0);

        await invokeCommand(tab0, 'cmd_tab_next');
        await tab0.waitForTimeout(500);

        const afterActive = await getActiveTabViaSW(context);
        expect(afterActive.index).toBe(1);
        if (DEBUG) console.log(`cmd_tab_next: index ${beforeActive.index} → ${afterActive.index}`);
    });

    test('cmd_tab_prev moves active tab from index 2 to index 1', async () => {
        const base = await context.newPage();
        await base.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(base);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        const r2 = await context.newPage();
        await r2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r2.waitForTimeout(200);

        // Get tabs from SW and find index 2 tab
        const allTabs = await getTabsViaSW(context);
        expect(allTabs.length).toBe(3);
        const tab2Info = allTabs.find((t: any) => t.index === 2);
        expect(tab2Info).toBeDefined();

        // Activate index 2 via SW (reliable)
        await activateTabViaSW(context, tab2Info!.id);
        await r2.waitForTimeout(300);

        const beforeActive = await getActiveTabViaSW(context);
        expect(beforeActive.index).toBe(2);

        await invokeCommand(r2, 'cmd_tab_previous');
        await r2.waitForTimeout(500);

        const afterActive = await getActiveTabViaSW(context);
        expect(afterActive.index).toBe(1);
        if (DEBUG) console.log(`cmd_tab_prev: index ${beforeActive.index} → ${afterActive.index}`);
    });

    test('cmd_tab_parent activates the opener tab from a child tab', async () => {
        const parent = await context.newPage();
        await parent.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(parent);

        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const parentTab = await getActiveTabViaSW(context);

        // Listen for new page before opening child tab
        const childPagePromise = context.waitForEvent('page');

        // Open a child tab with openerTabId set to parent
        const childId = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);

        // Wait for the child page to appear in Playwright's pages
        const childPage = await childPagePromise;
        // Navigate to fixture URL via Playwright to ensure content script is properly injected
        await childPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        // Give extension content script time to initialize in child tab
        await childPage.waitForTimeout(800);

        const allTabs = await getTabsViaSW(context);
        const childTabInfo = allTabs.find((t: any) => t.id === childId);
        expect(childTabInfo).toBeDefined();

        // Activate child tab via SW (reliable)
        await activateTabViaSW(context, childId);
        await parent.waitForTimeout(400);

        const activeBeforeInvoke = await getActiveTabViaSW(context);
        expect(activeBeforeInvoke.id).toBe(childId);

        // Invoke from the child page (content script sender.tab = child tab with openerTabId set)
        await invokeCommand(childPage, 'cmd_tab_parent');
        await parent.waitForTimeout(500);

        const afterActive = await getActiveTabViaSW(context);
        expect(afterActive.id).toBe(parentTab.id);
        if (DEBUG) console.log(`cmd_tab_parent: child ${childId} → parent ${parentTab.id} (active: ${afterActive.id})`);
    });
});
