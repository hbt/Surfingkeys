import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';

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

async function openChildTabViaSW(ctx: BrowserContext, openerTabId: number, url: string): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(({ openerTabId, url }) => {
        return new Promise<number>((resolve) => {
            chrome.tabs.create({ url, openerTabId, active: false }, (tab: any) => resolve(tab.id));
        });
    }, { openerTabId, url });
}

async function waitForTabCount(activePage: Page, expected: number) {
    const ctx = activePage.context();
    for (let i = 0; i < 50; i++) {
        await activePage.waitForTimeout(100).catch(() => {});
        if (ctx.pages().length <= expected) break;
    }
}

async function openWindowViaSW(ctx: BrowserContext, url: string): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((url: string) => {
        return new Promise<number>((resolve) => {
            chrome.windows.create({ url }, (win: any) => resolve(win.id));
        });
    }, url);
}

async function closeWindowViaSW(ctx: BrowserContext, windowId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((windowId: number) => {
        return new Promise<void>((resolve) => {
            chrome.windows.remove(windowId, () => resolve());
        });
    }, windowId);
}

async function getAllTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({}, (tabs: any[]) => resolve(tabs));
        });
    });
}

test.describe('cmd_tab_magic_close (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        const p = await context.newPage();
        await p.goto(FIXTURE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    async function closeAllExcept(keepPage: Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('cmd_tab_close_magic_right closes 1 tab to the right', async () => {
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(3);

        await invokeCommand(anchor, 'cmd_tab_close_magic_right');

        await waitForTabCount(anchor, beforeCount - 1);

        expect(context.pages().length).toBe(beforeCount - 1);
        console.log(`cmd_tab_close_magic_right: ${beforeCount} → ${context.pages().length}`);
    });

    test('cmd_tab_close_magic_left closes 1 tab to the left', async () => {
        const base = await context.newPage();
        await base.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(base);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await r1.bringToFront();
        await r1.waitForTimeout(300);

        const beforeCount = context.pages().length;

        await invokeCommand(r1, 'cmd_tab_close_magic_left');

        await waitForTabCount(r1, beforeCount - 1);

        expect(context.pages().length).toBe(beforeCount - 1);
        console.log(`cmd_tab_close_magic_left: ${beforeCount} → ${context.pages().length}`);
    });

    test('cmd_tab_close_magic_except_active closes all tabs except current', async () => {
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

        await invokeCommand(keeper, 'cmd_tab_close_magic_except_active');

        await waitForTabCount(keeper, 1);

        expect(context.pages().length).toBe(1);
        console.log(`cmd_tab_close_magic_except_active: ${beforeCount} → ${context.pages().length}`);
    });

    test('cmd_tab_close_magic_children closes only child tabs, leaves siblings', async () => {
        const parent = await context.newPage();
        await parent.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(parent);

        const sibling1 = await context.newPage();
        await sibling1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await sibling1.waitForTimeout(200);

        const sibling2 = await context.newPage();
        await sibling2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await sibling2.waitForTimeout(200);

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

        await invokeCommand(parent, 'cmd_tab_close_magic_children');

        await waitForTabCount(parent, beforeCount - 2);

        const afterCount = context.pages().length;
        expect(afterCount).toBe(beforeCount - 2);

        const remainingTabs = await getTabsViaSW(context);
        const remainingIds = new Set(remainingTabs.map((t: any) => t.id));
        expect(remainingIds.has(child1Id)).toBe(false);
        expect(remainingIds.has(child2Id)).toBe(false);

        console.log(`cmd_tab_close_magic_children: ${beforeCount} → ${afterCount}`);
    });

    test('cmd_tab_close_magic_right_inclusive closes current + all to the right', async () => {
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(3);

        // anchor + 2 to the right = 3 tabs closed
        await invokeCommand(anchor, 'cmd_tab_close_magic_right_inclusive');

        await waitForTabCount(anchor, beforeCount - 3);

        expect(context.pages().length).toBe(beforeCount - 3);
        console.log(`cmd_tab_close_magic_right_inclusive: ${beforeCount} → ${context.pages().length}`);
    });

    test('cmd_tab_close_magic_left_inclusive closes current + all to the left', async () => {
        const base = await context.newPage();
        await base.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(base);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await r1.bringToFront();
        await r1.waitForTimeout(300);

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(3);

        // r1 (rightmost) + 2 to the left = 3 tabs closed
        await invokeCommand(r1, 'cmd_tab_close_magic_left_inclusive');

        await waitForTabCount(r1, beforeCount - 3);

        expect(context.pages().length).toBe(beforeCount - 3);
        console.log(`cmd_tab_close_magic_left_inclusive: ${beforeCount} → ${context.pages().length}`);
    });

    test('cmd_tab_close_magic_children_recursive closes child + grandchild tabs', async () => {
        const parent = await context.newPage();
        await parent.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(parent);

        const sibling = await context.newPage();
        await sibling.goto(FIXTURE_URL, { waitUntil: 'load' });
        await sibling.waitForTimeout(200);

        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const parentTab = await getActiveTabViaSW(context);

        // parent → child → grandchild
        const childId = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
        await parent.waitForTimeout(300);

        const siblingTab = await getActiveTabViaSW(context);
        const grandchildId = await openChildTabViaSW(context, childId, FIXTURE_URL);
        await parent.waitForTimeout(300);

        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const beforeCount = context.pages().length;
        const allTabs = await getAllTabsViaSW(context);
        const siblingTabObj = allTabs.find((t: any) => t.id === siblingTab.id);

        await invokeCommand(parent, 'cmd_tab_close_magic_children_recursive');

        // child + grandchild = 2 tabs closed, sibling survives
        await waitForTabCount(parent, beforeCount - 2);

        const afterCount = context.pages().length;
        expect(afterCount).toBe(beforeCount - 2);

        const remainingTabs = await getAllTabsViaSW(context);
        const remainingIds = new Set(remainingTabs.map((t: any) => t.id));
        expect(remainingIds.has(childId)).toBe(false);
        expect(remainingIds.has(grandchildId)).toBe(false);
        expect(remainingIds.has(parentTab.id)).toBe(true);
        if (siblingTabObj) expect(remainingIds.has(siblingTabObj.id)).toBe(true);

        console.log(`cmd_tab_close_magic_children_recursive: ${beforeCount} → ${afterCount}`);
    });

    test('cmd_tab_close_magic_other_windows closes tabs in other windows', async () => {
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        const beforeCurrentWindow = context.pages().length;

        // Open a 2nd window with 2 tabs via SW
        const win2Id = await openWindowViaSW(context, FIXTURE_URL);
        await anchor.waitForTimeout(500);
        const sw = context.serviceWorkers()[0];
        await sw.evaluate(({ win2Id, url }: { win2Id: number; url: string }) => {
            return new Promise<void>((resolve) => {
                chrome.tabs.create({ windowId: win2Id, url, active: false }, () => resolve());
            });
        }, { win2Id, url: FIXTURE_URL });
        await anchor.waitForTimeout(500);

        const allTabsBefore = await getAllTabsViaSW(context);
        const win2Tabs = allTabsBefore.filter((t: any) => t.windowId === win2Id);
        expect(win2Tabs.length).toBeGreaterThanOrEqual(1);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);

        await invokeCommand(anchor, 'cmd_tab_close_magic_other_windows');
        await anchor.waitForTimeout(1000);

        const allTabsAfter = await getAllTabsViaSW(context);
        const win2TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win2Id);
        expect(win2TabsAfter.length).toBe(0);

        // Current window tabs should be intact
        const currentWindowTabsAfter = allTabsAfter.filter((t: any) => t.windowId !== win2Id);
        expect(currentWindowTabsAfter.length).toBe(beforeCurrentWindow);

        console.log(`cmd_tab_close_magic_other_windows: other window tabs removed`);
    });

    test('cmd_tab_close_magic_other_windows_no_pinned skips windows with pinned tabs', async () => {
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        const sw = context.serviceWorkers()[0];

        // 2nd window: no pinned tabs → should be closed
        const win2Id = await openWindowViaSW(context, FIXTURE_URL);
        await anchor.waitForTimeout(500);

        // 3rd window: has a pinned tab → should NOT be closed
        const win3Id = await openWindowViaSW(context, FIXTURE_URL);
        await anchor.waitForTimeout(500);

        // Pin the tab in win3
        const allTabsBefore = await getAllTabsViaSW(context);
        const win3Tab = allTabsBefore.find((t: any) => t.windowId === win3Id);
        await sw.evaluate((tabId: number) => {
            return new Promise<void>((resolve) => {
                chrome.tabs.update(tabId, { pinned: true }, () => resolve());
            });
        }, win3Tab.id);
        await anchor.waitForTimeout(300);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);

        await invokeCommand(anchor, 'cmd_tab_close_magic_other_windows_no_pinned');
        await anchor.waitForTimeout(1000);

        const allTabsAfter = await getAllTabsViaSW(context);
        const win2TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win2Id);
        const win3TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win3Id);

        expect(win2TabsAfter.length).toBe(0);   // no pinned → closed
        expect(win3TabsAfter.length).toBeGreaterThan(0); // has pinned → survives

        // Cleanup
        await closeWindowViaSW(context, win3Id).catch(() => {});

        console.log(`cmd_tab_close_magic_other_windows_no_pinned: win2 closed, win3 (pinned) survived`);
    });

    // Repeat count test uses key dispatch (specifically tests 2gxe chord + RUNTIME.repeats flow)
    test('2gxe closes 2 tabs to the right (repeat count via key dispatch)', async () => {
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
        }

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(4);

        for (const key of ['2', 'g', 'x', 'e']) {
            await anchor.keyboard.press(key).catch(() => {});
            await anchor.waitForTimeout(50);
        }

        await waitForTabCount(anchor, beforeCount - 2);

        expect(context.pages().length).toBe(beforeCount - 2);
        console.log(`2gxe: ${beforeCount} → ${context.pages().length}`);
    });
});
