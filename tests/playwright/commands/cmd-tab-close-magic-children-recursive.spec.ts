import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_magic_children_recursive';
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

async function waitForTabCount(activePage: Page, expected: number) {
    const ctx = activePage.context();
    for (let i = 0; i < 50; i++) {
        await activePage.waitForTimeout(100).catch(() => {});
        if (ctx.pages().length <= expected) break;
    }
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

test.describe('cmd_tab_close_magic_children_recursive (Playwright)', () => {
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

    test('cmd_tab_close_magic_children_recursive closes child + grandchild tabs', async () => {
        const parentUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_children_recursive_closes_child_grandchild_tabs`)}`;
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

        const siblingTab = await getActiveTabViaSW(context);
        const grandchildId = await openChildTabViaSW(context, childId, FIXTURE_URL);
        await parent.waitForTimeout(300);

        await parent.bringToFront();
        await parent.waitForTimeout(300);

        const beforeCount = context.pages().length;
        const allTabs = await getAllTabsViaSW(context);
        const siblingTabObj = allTabs.find((t: any) => t.id === siblingTab.id);

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

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

        if (DEBUG) console.log(`cmd_tab_close_magic_children_recursive: ${beforeCount} → ${afterCount}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
