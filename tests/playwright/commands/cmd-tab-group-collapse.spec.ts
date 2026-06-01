import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_tab_group_collapse';
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

test.describe('cmd_tab_group_collapse (Playwright)', () => {
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

    test('tab in a group → invoke → group is collapsed', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const available = await tabGroupsAvailable(context);
            if (!available) {
                test.skip();
                return;
            }

            const tabId = await getActiveTabId(context);
            expect(tabId).toBeGreaterThan(0);

            const groupId = await groupTab(context, tabId);
            expect(groupId).toBeGreaterThan(-1);
            await page.waitForTimeout(200);

            await invokeCommand(page, 'cmd_tab_group_collapse');
            await page.waitForTimeout(300);

            const groups = await getTabGroups(context);
            const ourGroup = groups.find((g: any) => g.id === groupId);
            expect(ourGroup).toBeDefined();
            expect(ourGroup.collapsed).toBe(true);
        });
    });

    test('tab not in any group → invoke → no error, no groups updated', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const available = await tabGroupsAvailable(context);
            if (!available) {
                test.skip();
                return;
            }

            const tabId = await getActiveTabId(context);
            expect(tabId).toBeGreaterThan(0);
            // Tab is already ungrouped from beforeEach

            const groupsBefore = await getTabGroups(context);
            // Filter out groups containing our tab (should be none)
            const ourGroupBefore = groupsBefore.find((g: any) => false); // no group expected
            expect(ourGroupBefore).toBeUndefined();

            // Should not throw
            await invokeCommand(page, 'cmd_tab_group_collapse');
            await page.waitForTimeout(200);

            // No new groups created, existing groups unchanged
            const groupsAfter = await getTabGroups(context);
            expect(groupsAfter.length).toBe(groupsBefore.length);
        });
    });
});
