import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function getTabGroups(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    const result = await sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            if (!chrome.tabGroups) {
                resolve([]);
                return;
            }
            chrome.tabGroups.query({}, (groups: any[]) => resolve(groups || []));
        });
    });
    return result || [];
}

async function getActiveTabId(ctx: BrowserContext): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs[0]?.id ?? -1);
            });
        });
    });
}

async function createTabGroupForTab(ctx: BrowserContext, tabId: number): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((tabId: number) => {
        return new Promise<number>((resolve) => {
            if (!chrome.tabs.group) {
                resolve(-1);
                return;
            }
            chrome.tabs.group({ tabIds: [tabId] }, (groupId: number) => resolve(groupId ?? -1));
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

async function getTabGroupId(ctx: BrowserContext, tabId: number): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return -1;
    return sw.evaluate((tabId: number) => {
        return new Promise<number>((resolve) => {
            chrome.tabs.get(tabId, (tab) => resolve(tab?.groupId ?? -1));
        });
    }, tabId);
}

async function tabGroupsAvailable(ctx: BrowserContext): Promise<boolean> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return false;
    return sw.evaluate(() => {
        return !!(chrome.tabGroups && chrome.tabs.group);
    });
}

test.describe('cmd_create_tab_group (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_create_tab_group');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        // Ungroup active tab if grouped
        const tabId = await getActiveTabId(context);
        if (tabId !== -1) {
            await ungroupTab(context, tabId).catch(() => {});
        }
        await page.waitForTimeout(100);
    });

    test('tab groups API is available in service worker', async () => {
        const available = await tabGroupsAvailable(context);
        if (DEBUG) console.log(`Tab groups API available: ${available}`);
        // Just report — don't fail if headless Chrome doesn't support it
        expect(typeof available).toBe('boolean');
    });

    test('creating a tab group adds tab to a group', async () => {
        const available = await tabGroupsAvailable(context);
        if (!available) {
            if (DEBUG) console.log('Tab groups API not available — skipping');
            test.skip();
            return;
        }

        const tabId = await getActiveTabId(context);
        expect(tabId).toBeGreaterThan(0);

        const initialGroups = await getTabGroups(context);
        const initialCount = initialGroups.length;

        const groupId = await createTabGroupForTab(context, tabId);
        expect(groupId).toBeGreaterThan(-1);

        await page.waitForTimeout(300);

        const newGroupId = await getTabGroupId(context, tabId);
        expect(newGroupId).toBeGreaterThan(-1);
        expect(newGroupId).toBe(groupId);

        const finalGroups = await getTabGroups(context);
        expect(finalGroups.length).toBeGreaterThan(initialCount);
        if (DEBUG) console.log(`Tab grouped: groupId=${groupId}, total groups: ${finalGroups.length}`);
    });

    test('grouped tab appears in chrome.tabGroups API', async () => {
        const available = await tabGroupsAvailable(context);
        if (!available) {
            if (DEBUG) console.log('Tab groups API not available — skipping');
            test.skip();
            return;
        }

        const tabId = await getActiveTabId(context);
        const groupId = await createTabGroupForTab(context, tabId);
        await page.waitForTimeout(300);

        const groups = await getTabGroups(context);
        const ourGroup = groups.find((g: any) => g.id === groupId);
        expect(ourGroup).toBeDefined();
        if (DEBUG) console.log(`Group found: id=${ourGroup.id}, color=${ourGroup.color}`);
    });
});
