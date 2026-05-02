import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_magic_close';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

function assertBasicCoverage(
    bgPath: string | null,
    contentPath: string | null,
    opts?: { expectedBackgroundFunctions?: string[]; requireContent?: boolean },
): void {
    if (process.env.COVERAGE !== 'true') return;
    expect(bgPath).toBeTruthy();
    if (bgPath) {
        const bg = readCoverageStats(bgPath, 'service_worker', 'background.js');
        expect(bg.total).toBeGreaterThan(0);
        expect(bg.zero).toBeGreaterThan(0);
        expect(bg.gt0).toBeGreaterThan(0);
        for (const fn of opts?.expectedBackgroundFunctions ?? []) {
            expect(bg.byFunction.get(fn) ?? 0).toBeGreaterThan(0);
        }
    }

    if (opts?.requireContent !== false) {
        expect(contentPath).toBeTruthy();
    } else if (DEBUG && !contentPath) {
        console.log('Content coverage target closed before persistence; treating as background-only.');
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

async function waitForHttpPageCount(ctx: BrowserContext, expected: number) {
    for (let i = 0; i < 50; i++) {
        const httpCount = ctx.pages().filter(p => p.url().startsWith('http')).length;
        if (httpCount <= expected) break;
        await new Promise(r => setTimeout(r, 100));
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
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        const p = await context.newPage();
        await p.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
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

    test('cmd_tab_close_magic_right closes all tabs to the right', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_right_closes_all_tabs_to_the_right`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 1`);
        }

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(3);

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_right');

        await waitForTabCount(anchor, beforeCount - 2);

        expect(context.pages().length).toBe(beforeCount - 2);
        if (DEBUG) console.log(`cmd_tab_close_magic_right: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_left closes all tabs to the left', async () => {
        const base = await context.newPage();
        await base.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(base);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1Url = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_left_closes_all_tabs_to_the_left`)}`;
        const r1 = await context.newPage();
        await r1.goto(r1Url, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await r1.bringToFront();
        await r1.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(r1Url);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 2`);
        }

        const beforeCount = context.pages().length;

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(r1, 'cmd_tab_close_magic_left');

        await waitForTabCount(r1, beforeCount - 2);

        expect(context.pages().length).toBe(beforeCount - 2);
        if (DEBUG) console.log(`cmd_tab_close_magic_left: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
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
        const keeperIdx = Math.floor(pages.length / 2);
        const keeperUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_except_active_closes_all_tabs_except_current`)}`;
        const keeper = pages[keeperIdx];
        await keeper.goto(keeperUrl, { waitUntil: 'load' });
        await keeper.waitForTimeout(200);
        await keeper.bringToFront();
        await keeper.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(keeperUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 3`);
        }

        const beforeCount = context.pages().length;

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(keeper, 'cmd_tab_close_magic_except_active');

        await waitForTabCount(keeper, 1);

        expect(context.pages().length).toBe(1);
        if (DEBUG) console.log(`cmd_tab_close_magic_except_active: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_children closes only child tabs, leaves siblings', async () => {
        const parentUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_children_closes_only_child_tabs_leaves_siblings`)}`;
        const parent = await context.newPage();
        await parent.goto(parentUrl, { waitUntil: 'load' });
        await closeAllExcept(parent);

        const sibling1 = await context.newPage();
        await sibling1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await sibling1.waitForTimeout(200);

        const sibling2 = await context.newPage();
        await sibling2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await sibling2.waitForTimeout(200);

        await parent.bringToFront();
        await parent.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(parentUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 4`);
        }

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

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(parent, 'cmd_tab_close_magic_children');

        await waitForTabCount(parent, beforeCount - 2);

        const afterCount = context.pages().length;
        expect(afterCount).toBe(beforeCount - 2);

        const remainingTabs = await getTabsViaSW(context);
        const remainingIds = new Set(remainingTabs.map((t: any) => t.id));
        expect(remainingIds.has(child1Id)).toBe(false);
        expect(remainingIds.has(child2Id)).toBe(false);

        if (DEBUG) console.log(`cmd_tab_close_magic_children: ${beforeCount} → ${afterCount}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_right_inclusive closes current + all to the right', async () => {
        // The active tab itself is closed — use the manual close pattern.
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_right_inclusive_closes_current_all_to_the_right`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 5`);
        }

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(3);

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        // anchor + 2 to the right = 3 tabs closed (anchor itself is closed)
        // Fire content flush immediately — the anchor target disappears on invocation.
        const contentFlushPromise = covContent?.flush(`${SUITE_LABEL}/${coverageSlug(test.info().title)}/content`).catch(() => null) ?? Promise.resolve(null);
        await invokeCommand(anchor, 'cmd_tab_close_magic_right_inclusive').catch(() => {});

        // When all fixture tabs are closed, Playwright may auto-create a blank tab to keep
        // the context alive. Wait specifically for HTTP page count to drop.
        const expectedRight = beforeCount - 3;
        // Chrome won't close the last tab in a window; allow 1 surviving tab when all are targeted.
        await waitForHttpPageCount(context, Math.max(expectedRight, 1));
        const httpPagesRight = context.pages().filter(p => p.url().startsWith('http')).length;
        expect(httpPagesRight).toBeLessThanOrEqual(Math.max(expectedRight, 1));
        if (DEBUG) console.log(`cmd_tab_close_magic_right_inclusive: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await contentFlushPromise;
        assertBasicCoverage(bgPath, contentPath, { requireContent: false });
        await covContent?.close().catch(() => {});
    });

    test('cmd_tab_close_magic_left_inclusive closes current + all to the left', async () => {
        // The active tab itself is closed — use the manual close pattern.
        const base = await context.newPage();
        await base.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(base);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1Url = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_left_inclusive_closes_current_all_to_the_left`)}`;
        const r1 = await context.newPage();
        await r1.goto(r1Url, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await r1.bringToFront();
        await r1.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(r1Url);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 6`);
        }

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(3);

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        // r1 (rightmost) + 2 to the left = 3 tabs closed (r1 itself is closed)
        // Fire content flush immediately — the r1 target disappears on invocation.
        const contentFlushPromise = covContent?.flush(`${SUITE_LABEL}/${coverageSlug(test.info().title)}/content`).catch(() => null) ?? Promise.resolve(null);
        await invokeCommand(r1, 'cmd_tab_close_magic_left_inclusive').catch(() => {});

        const expectedLeft = beforeCount - 3;
        // Chrome won't close the last tab in a window; allow 1 surviving tab when all are targeted.
        await waitForHttpPageCount(context, Math.max(expectedLeft, 1));
        const httpPagesLeft = context.pages().filter(p => p.url().startsWith('http')).length;
        expect(httpPagesLeft).toBeLessThanOrEqual(Math.max(expectedLeft, 1));
        if (DEBUG) console.log(`cmd_tab_close_magic_left_inclusive: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await contentFlushPromise;
        assertBasicCoverage(bgPath, contentPath, { requireContent: false });
        await covContent?.close().catch(() => {});
    });

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
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 7`);
        }

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

    test('cmd_tab_close_magic_other_windows closes tabs in other windows', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_other_windows_closes_tabs_in_other_windows`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
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
        const covContent = await initContentCoverageForUrl?.(anchorUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 8`);
        }

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_other_windows');
        await anchor.waitForTimeout(1000);

        const allTabsAfter = await getAllTabsViaSW(context);
        const win2TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win2Id);
        expect(win2TabsAfter.length).toBe(0);

        // Current window tabs should be intact
        const currentWindowTabsAfter = allTabsAfter.filter((t: any) => t.windowId !== win2Id);
        expect(currentWindowTabsAfter.length).toBe(beforeCurrentWindow);

        if (DEBUG) console.log(`cmd_tab_close_magic_other_windows: other window tabs removed`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_other_windows_no_pinned skips windows with pinned tabs', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_other_windows_no_pinned_skips_windows_with_pinned_tabs`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
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
        const covContent = await initContentCoverageForUrl?.(anchorUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 9`);
        }

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_other_windows_no_pinned');
        await anchor.waitForTimeout(1000);

        const allTabsAfter = await getAllTabsViaSW(context);
        const win2TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win2Id);
        const win3TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win3Id);

        expect(win2TabsAfter.length).toBe(0);   // no pinned → closed
        expect(win3TabsAfter.length).toBeGreaterThan(0); // has pinned → survives

        // Cleanup
        await closeWindowViaSW(context, win3Id).catch(() => {});

        if (DEBUG) console.log(`cmd_tab_close_magic_other_windows_no_pinned: win2 closed, win3 (pinned) survived`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_all_window closes all tabs in current window including active', async () => {
        // Active tab itself is closed — use contentFlushPromise pattern.
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_all_window_closes_all_tabs_in_current_window`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        const extra = await context.newPage();
        await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
        await extra.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 11`);
        }

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(2);

        await covBg?.snapshot();
        await covContent?.snapshot();

        const contentFlushPromise = covContent?.flush(`${SUITE_LABEL}/${coverageSlug(test.info().title)}/content`).catch(() => null) ?? Promise.resolve(null);
        await invokeCommand(anchor, 'cmd_tab_close_magic_all_window').catch(() => {});

        // Chrome keeps the last tab alive rather than closing the window entirely.
        await waitForHttpPageCount(context, 0);
        const httpPages = context.pages().filter(p => p.url().startsWith('http')).length;
        expect(httpPages).toBeLessThanOrEqual(1);
        if (DEBUG) console.log(`cmd_tab_close_magic_all_window: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await contentFlushPromise;
        assertBasicCoverage(bgPath, contentPath, { requireContent: false });
        await covContent?.close().catch(() => {});
    });

    test('cmd_tab_close_magic_all_windows closes all tabs in all windows except active tab', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_all_windows_closes_all_except_active`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Extra tab in current window (will be closed)
        const extra = await context.newPage();
        await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
        await extra.waitForTimeout(200);

        // 2nd window with a tab (will be closed)
        const win2Id = await openWindowViaSW(context, FIXTURE_URL);
        await anchor.waitForTimeout(500);

        const allTabsBefore = await getAllTabsViaSW(context);
        const anchorTab = allTabsBefore.find((t: any) => t.active && t.windowId !== win2Id);
        const currentWindowId = anchorTab?.windowId;
        expect(allTabsBefore.length).toBeGreaterThanOrEqual(3);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 12`);
        }

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_all_windows');
        await anchor.waitForTimeout(1000);

        const allTabsAfter = await getAllTabsViaSW(context);
        const win2TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win2Id);
        const currentWindowTabsAfter = allTabsAfter.filter((t: any) => t.windowId === currentWindowId);
        expect(win2TabsAfter.length).toBe(0);
        expect(currentWindowTabsAfter.length).toBe(1); // only anchor survives
        if (DEBUG) console.log(`cmd_tab_close_magic_all_windows: ${allTabsBefore.length} → ${allTabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_incognito is no-op when no incognito tabs visible', async () => {
        // In "split" incognito mode the non-incognito SW cannot query incognito tabs.
        // chrome.tabs.query({}) from the regular SW returns only regular tabs, so
        // AllIncognitoTabs always resolves to an empty list and the command is a no-op.
        // This test verifies the command executes without error and leaves regular tabs intact.
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_incognito_is_noop`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 13`);
        }

        const beforeCount = context.pages().length;

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_incognito');
        await anchor.waitForTimeout(500);

        // No regular tabs should have been closed
        expect(context.pages().length).toBe(beforeCount);
        if (DEBUG) console.log(`cmd_tab_close_magic_incognito: no-op, count unchanged at ${beforeCount}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    // Repeat count test uses key dispatch (specifically tests 2gxe chord + RUNTIME.repeats flow)
    test('2gxe closes 2 tabs to the right (repeat count via key dispatch)', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/2gxe_closes_2_tabs_to_the_right_repeat_count_via_key_dispatch`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
        }

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 10`);
        }

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(4);

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        for (const key of ['2', 'g', 'x', 'e']) {
            await anchor.keyboard.press(key).catch(() => {});
            await anchor.waitForTimeout(50);
        }

        await waitForTabCount(anchor, beforeCount - 2);

        expect(context.pages().length).toBe(beforeCount - 2);
        if (DEBUG) console.log(`2gxe: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
