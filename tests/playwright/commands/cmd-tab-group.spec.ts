import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_group';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

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
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
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
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const tabId = await getActiveTabId(context);
            expect(tabId).toBeGreaterThan(0);

            const groupId = await getTabGroupId(context, tabId);
            const isUngrouped = groupId === -1 || groupId === undefined;
            expect(isUngrouped).toBe(true);

            const groups = await getTabGroups(context);
            expect(Array.isArray(groups)).toBe(true);
            if (DEBUG) console.log(`Initial group count: ${groups.length}`);
        });
    });

    test('grouping a tab via Chrome API adds it to a group', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const available = await tabGroupsAvailable(context);
            if (!available) {
                if (DEBUG) console.log('Tab groups API not available — skipping');
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
            if (DEBUG) console.log(`Grouped tab ${tabId} into group ${groupId}`);
        });
    });

    test('group properties can be queried and updated', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const available = await tabGroupsAvailable(context);
            if (!available) {
                if (DEBUG) console.log('Tab groups API not available — skipping');
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
            if (DEBUG) console.log(`Group updated: title="${ourGroup.title}", color=${ourGroup.color}`);
        });
    });
});
