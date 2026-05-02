import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_reload_magic_children';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

function assertBasicCoverage(bgPath: string | null, contentPath: string | null): void {
    if (process.env.COVERAGE !== 'true') return;
    expect(bgPath).toBeTruthy();
    if (bgPath) {
        const bg = readCoverageStats(bgPath, 'service_worker', 'background.js');
        expect(bg.total).toBeGreaterThan(0);
        expect(bg.zero).toBeGreaterThan(0);
        expect(bg.gt0).toBeGreaterThan(0);
    }
    if (contentPath) {
        const content = readCoverageStats(contentPath, 'page', 'content.js');
        expect(content.total).toBeGreaterThan(0);
        expect(content.zero).toBeGreaterThan(0);
        expect(content.gt0).toBeGreaterThan(0);
    }
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

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
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

test.describe('cmd_tab_reload_magic_children (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        for (const p of context.pages()) {
            await p.close().catch(() => {});
        }
    });
    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    async function closeAllExcept(keepPage: Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('cmd_tab_reload_magic_children reloads child tabs, tab count unchanged', async () => {
        const parentUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/children_reload`)}`;
        const parent = await context.newPage();
        await parent.goto(parentUrl, { waitUntil: 'load' });
        await closeAllExcept(parent);

        await parent.bringToFront();
        await parent.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(parentUrl);

        const parentTab = await getActiveTabViaSW(context);

        const child1Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
        const child2Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
        await parent.waitForTimeout(600);

        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const tabsBefore = await getTabsViaSW(context);
        const childTabs = tabsBefore.filter((t: any) => t.openerTabId === parentTab.id);
        expect(childTabs.length).toBe(2);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(parent, 'cmd_tab_reload_magic_children');
        await parent.waitForTimeout(600);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length);

        const afterTabIds = tabsAfter.map((t: any) => t.id);
        expect(afterTabIds).toContain(child1Id);
        expect(afterTabIds).toContain(child2Id);
        if (DEBUG) console.log(`cmd_tab_reload_magic_children: tab count ${tabsBefore.length} → ${tabsAfter.length} (unchanged)`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
