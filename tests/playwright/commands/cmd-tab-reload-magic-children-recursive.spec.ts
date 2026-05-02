import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_reload_magic_children_recursive';
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

async function getAllTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({}, (tabs: any[]) => resolve(tabs));
        });
    });
}

test.describe('cmd_tab_reload_magic_children_recursive (Playwright)', () => {
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

    test('cmd_tab_reload_magic_children_recursive reloads child and grandchild tabs, tab count unchanged', async () => {
        const parentUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/children_recursive_reload`)}`;
        const parent = await context.newPage();
        await parent.goto(parentUrl, { waitUntil: 'load' });
        await closeAllExcept(parent);

        const sibling = await context.newPage();
        await sibling.goto(FIXTURE_URL, { waitUntil: 'load' });
        await sibling.waitForTimeout(200);

        await parent.bringToFront();
        await parent.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(parentUrl);

        const parentTab = await getActiveTabViaSW(context);

        // parent → child → grandchild
        const childId = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
        await parent.waitForTimeout(300);

        const grandchildId = await openChildTabViaSW(context, childId, FIXTURE_URL);
        await parent.waitForTimeout(300);

        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const allTabsBefore = await getAllTabsViaSW(context);
        const beforeCount = allTabsBefore.length;
        const beforeTabIds = allTabsBefore.map((t: any) => t.id);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(parent, 'cmd_tab_reload_magic_children_recursive');
        await parent.waitForTimeout(600);

        const allTabsAfter = await getAllTabsViaSW(context);
        expect(allTabsAfter.length).toBe(beforeCount);

        const afterTabIds = allTabsAfter.map((t: any) => t.id);
        expect(afterTabIds).toContain(childId);
        expect(afterTabIds).toContain(grandchildId);
        for (const id of beforeTabIds) {
            expect(afterTabIds).toContain(id);
        }
        if (DEBUG) console.log(`cmd_tab_reload_magic_children_recursive: tab count ${beforeCount} → ${allTabsAfter.length} (unchanged)`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
