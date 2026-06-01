import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_tab_group_collapse_all';
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

async function setGroupCollapsed(ctx: BrowserContext, groupId: number, collapsed: boolean): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate(({ groupId, collapsed }: { groupId: number; collapsed: boolean }) => {
        return new Promise<void>((resolve) => {
            if (!chrome.tabGroups?.update) { resolve(); return; }
            chrome.tabGroups.update(groupId, { collapsed }, () => resolve());
        });
    }, { groupId, collapsed });
}

test.describe('cmd_tab_group_collapse_all (Playwright)', () => {
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

    test('two expanded groups → invoke → both collapsed', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const available = await tabGroupsAvailable(context);
            if (!available) {
                test.skip();
                return;
            }

            // Get current active tab and open a second tab to create two groups
            const tab1Id = await getActiveTabId(context);
            expect(tab1Id).toBeGreaterThan(0);

            // Open a second tab
            const tab2Id = await (async () => {
                const sw = context.serviceWorkers()[0];
                if (!sw) return -1;
                return sw.evaluate((url: string) => {
                    return new Promise<number>((resolve) => {
                        chrome.tabs.create({ url, active: false }, (tab) => resolve(tab?.id ?? -1));
                    });
                }, FIXTURE_URL);
            })();
            expect(tab2Id).toBeGreaterThan(0);
            await page.waitForTimeout(200);

            // Group both tabs separately
            const groupId1 = await groupTab(context, tab1Id);
            expect(groupId1).toBeGreaterThan(-1);
            const groupId2 = await groupTab(context, tab2Id);
            expect(groupId2).toBeGreaterThan(-1);
            await page.waitForTimeout(200);

            // Expand both groups explicitly
            await setGroupCollapsed(context, groupId1, false);
            await setGroupCollapsed(context, groupId2, false);
            await page.waitForTimeout(200);

            // Verify both are expanded
            const groupsBefore = await getTabGroups(context);
            const g1Before = groupsBefore.find((g: any) => g.id === groupId1);
            const g2Before = groupsBefore.find((g: any) => g.id === groupId2);
            expect(g1Before?.collapsed).toBe(false);
            expect(g2Before?.collapsed).toBe(false);

            // Invoke collapse all
            await invokeCommand(page, 'cmd_tab_group_collapse_all');
            await page.waitForTimeout(300);

            // Both should be collapsed
            const groupsAfter = await getTabGroups(context);
            const g1After = groupsAfter.find((g: any) => g.id === groupId1);
            const g2After = groupsAfter.find((g: any) => g.id === groupId2);
            expect(g1After?.collapsed).toBe(true);
            expect(g2After?.collapsed).toBe(true);

            // Cleanup: close the extra tab and ungroup
            await ungroupTab(context, tab1Id).catch(() => {});
            await (async () => {
                const sw = context.serviceWorkers()[0];
                if (!sw) return;
                await sw.evaluate((tabId: number) => {
                    return new Promise<void>((resolve) => {
                        chrome.tabs.remove(tabId, () => resolve());
                    });
                }, tab2Id);
            })();
        });
    });
});
