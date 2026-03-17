import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function tabGroupsAvailable(ctx: BrowserContext): Promise<boolean> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return false;
    return sw.evaluate(() => {
        return !!(chrome.tabGroups && chrome.tabs.group);
    });
}

async function getActiveTabId(ctx: BrowserContext): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return -1;
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs[0]?.id ?? -1);
            });
        });
    });
}

async function getTabGroupId(ctx: BrowserContext, tabId: number): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return -1;
    return sw.evaluate((tabId: number) => {
        return new Promise<number>((resolve) => {
            chrome.tabs.get(tabId, (tab) => resolve(tab?.groupId ?? -1));
        });
    }, tabId);
}

async function getTabGroups(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return [];
    const result = await sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            if (!chrome.tabGroups) { resolve([]); return; }
            chrome.tabGroups.query({}, (groups) => resolve(groups || []));
        });
    });
    return result || [];
}

async function groupTab(ctx: BrowserContext, tabId: number): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return -1;
    return sw.evaluate((tabId: number) => {
        return new Promise<number>((resolve) => {
            if (!chrome.tabs.group) { resolve(-1); return; }
            chrome.tabs.group({ tabIds: [tabId] }, (groupId) => resolve(groupId ?? -1));
        });
    }, tabId);
}

async function ungroupTab(ctx: BrowserContext, tabId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate((tabId: number) => {
        return new Promise<void>((resolve) => {
            if (!chrome.tabs.ungroup) { resolve(); return; }
            chrome.tabs.ungroup([tabId], () => resolve());
        });
    }, tabId);
}

async function updateTabGroup(ctx: BrowserContext, groupId: number, title: string, color: string): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate(({ groupId, title, color }: { groupId: number; title: string; color: string }) => {
        return new Promise<void>((resolve) => {
            if (!chrome.tabGroups?.update) { resolve(); return; }
            chrome.tabGroups.update(groupId, { title, color: color as any }, () => resolve());
        });
    }, { groupId, title, color });
}

test.describe('cmd_tab_group (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        const tabId = await getActiveTabId(context);
        if (tabId !== -1) {
            await ungroupTab(context, tabId).catch(() => {});
        }
        await page.waitForTimeout(100);
    });

    test('tab is initially ungrouped', async () => {
        const tabId = await getActiveTabId(context);
        expect(tabId).toBeGreaterThan(0);

        const groupId = await getTabGroupId(context, tabId);
        const isUngrouped = groupId === -1 || groupId === undefined;
        expect(isUngrouped).toBe(true);

        const groups = await getTabGroups(context);
        expect(Array.isArray(groups)).toBe(true);
        console.log(`Initial group count: ${groups.length}`);
    });

    test('grouping a tab via Chrome API adds it to a group', async () => {
        const available = await tabGroupsAvailable(context);
        if (!available) {
            console.log('Tab groups API not available — skipping');
            test.skip();
            return;
        }

        const tabId = await getActiveTabId(context);
        const initialGroups = await getTabGroups(context);

        const groupId = await groupTab(context, tabId);
        expect(groupId).toBeGreaterThan(-1);

        await page.waitForTimeout(300);

        const newGroupId = await getTabGroupId(context, tabId);
        expect(newGroupId).toBe(groupId);

        const finalGroups = await getTabGroups(context);
        expect(finalGroups.length).toBeGreaterThan(initialGroups.length);
        console.log(`Grouped tab ${tabId} into group ${groupId}`);
    });

    test('group properties can be queried and updated', async () => {
        const available = await tabGroupsAvailable(context);
        if (!available) {
            console.log('Tab groups API not available — skipping');
            test.skip();
            return;
        }

        const tabId = await getActiveTabId(context);
        const groupId = await groupTab(context, tabId);
        expect(groupId).toBeGreaterThan(-1);

        await updateTabGroup(context, groupId, 'Test Group', 'blue');
        await page.waitForTimeout(300);

        const groups = await getTabGroups(context);
        const ourGroup = groups.find((g: any) => g.id === groupId);
        expect(ourGroup).toBeDefined();
        expect(ourGroup.title).toBe('Test Group');
        expect(ourGroup.color).toBe('blue');
        console.log(`Group updated: title="${ourGroup.title}", color=${ourGroup.color}`);
    });
});
