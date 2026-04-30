import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_detach';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

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

async function getAllWindowsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.windows.getAll({ populate: true }, (windows: any[]) => resolve(windows));
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

async function waitForWindowCount(ctx: BrowserContext, expected: number, maxWaitMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const windows = await getAllWindowsViaSW(ctx);
        if (windows.length >= expected) return;
        await new Promise(r => setTimeout(r, 100));
    }
}

test.describe('cmd_tab_detach (Playwright)', () => {
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

    async function closeAllExcept(keepPage: import('@playwright/test').Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    async function closeExtraWindows(keepWindowId: number) {
        const windows = await getAllWindowsViaSW(context);
        for (const w of windows) {
            if (w.id !== keepWindowId) {
                const sw = context.serviceWorkers()[0];
                await sw.evaluate((id: number) => {
                    return new Promise<void>((resolve) => {
                        chrome.windows.remove(id, () => resolve());
                    });
                }, w.id).catch(() => {});
            }
        }
        await new Promise(r => setTimeout(r, 300));
    }

    test('cmd_tab_detach creates a new window (2 windows total)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const anchor = await context.newPage();
            await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
            await closeAllExcept(anchor);

            // Add a second tab so the original window persists after detach
            const extra = await context.newPage();
            await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
            await extra.waitForTimeout(200);

            await anchor.bringToFront();
            await anchor.waitForTimeout(300);

            const beforeWindows = await getAllWindowsViaSW(context);
            const beforeWindowCount = beforeWindows.length;

            await invokeCommand(anchor, 'cmd_tab_detach');
            await waitForWindowCount(context, beforeWindowCount + 1);

            const afterWindows = await getAllWindowsViaSW(context);
            expect(afterWindows.length).toBe(beforeWindowCount + 1);
            if (DEBUG) console.log(`cmd_tab_detach: windows ${beforeWindowCount} → ${afterWindows.length}`);

            // Cleanup extra windows
            const sw = context.serviceWorkers()[0];
            const anchorWindowId = (await sw.evaluate(() => {
                return new Promise<number>((resolve) => {
                    chrome.windows.getLastFocused({}, (w: any) => resolve(w.id));
                });
            }));
            for (const w of afterWindows) {
                if (w.id !== anchorWindowId) {
                    await sw.evaluate((id: number) => {
                        return new Promise<void>((resolve) => {
                            chrome.windows.remove(id, () => resolve());
                        });
                    }, w.id).catch(() => {});
                }
            }
            await new Promise(r => setTimeout(r, 300));
        });
    });

    test('cmd_tab_detach_magic_right moves tabs to the right to a new window', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const anchor = await context.newPage();
            await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
            await closeAllExcept(anchor);

            const r1 = await context.newPage();
            await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
            await r1.waitForTimeout(200);

            const r2 = await context.newPage();
            await r2.goto(FIXTURE_URL, { waitUntil: 'load' });
            await r2.waitForTimeout(200);

            await anchor.bringToFront();
            await anchor.waitForTimeout(300);

            const activeTab = await getActiveTabViaSW(context);
            expect(activeTab.index).toBe(0);

            const beforeWindows = await getAllWindowsViaSW(context);
            const originalWindowId = activeTab.windowId;

            await invokeCommand(anchor, 'cmd_tab_detach_magic_right');
            await waitForWindowCount(context, beforeWindows.length + 1);
            await new Promise(r => setTimeout(r, 500));

            const afterWindows = await getAllWindowsViaSW(context);
            expect(afterWindows.length).toBe(beforeWindows.length + 1);

            const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
            const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

            expect(originalWindow).toBeDefined();
            expect(newWindow).toBeDefined();

            // Original window should have 2 tabs (anchor + 1 detached to new), new window has 1
            // DirectionRight from index 0 with repeats=1 moves 1 tab to the right
            expect(newWindow.tabs.length).toBe(1);
            expect(originalWindow.tabs.length).toBe(2);
            if (DEBUG) console.log(`cmd_tab_detach_magic_right: original ${originalWindow.tabs.length} tabs, new ${newWindow.tabs.length} tabs`);

            // Cleanup
            await new Promise(r => setTimeout(r, 300));
            await closeExtraWindows(originalWindowId);
        });
    });

    test('cmd_tab_detach_magic_except_active moves all other tabs to new window', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
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

            const activeTab = await getActiveTabViaSW(context);
            const originalWindowId = activeTab.windowId;

            const beforeWindows = await getAllWindowsViaSW(context);
            const originalWindow = beforeWindows.find((w: any) => w.id === originalWindowId);
            const totalTabs = originalWindow!.tabs.length;

            await invokeCommand(keeper, 'cmd_tab_detach_magic_except_active');
            await waitForWindowCount(context, beforeWindows.length + 1);
            await new Promise(r => setTimeout(r, 500));

            const afterWindows = await getAllWindowsViaSW(context);
            expect(afterWindows.length).toBe(beforeWindows.length + 1);

            const afterOriginalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
            const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

            expect(afterOriginalWindow).toBeDefined();
            expect(newWindow).toBeDefined();
            expect(afterOriginalWindow!.tabs.length).toBe(1);
            expect(newWindow!.tabs.length).toBe(totalTabs - 1);
            if (DEBUG) console.log(`cmd_tab_detach_magic_except_active: original 1 tab, new ${newWindow!.tabs.length} tabs`);

            // Cleanup
            await new Promise(r => setTimeout(r, 300));
            await closeExtraWindows(originalWindowId);
        });
    });

    test('cmd_tab_detach_magic_children moves child tabs to new window', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const parent = await context.newPage();
            await parent.goto(FIXTURE_URL, { waitUntil: 'load' });
            await closeAllExcept(parent);

            await parent.bringToFront();
            await parent.waitForTimeout(300);

            const parentTab = await getActiveTabViaSW(context);
            const originalWindowId = parentTab.windowId;

            await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
            await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
            await parent.waitForTimeout(600);

            await parent.bringToFront();
            await parent.waitForTimeout(300);

            const allTabs = await getTabsViaSW(context);
            const childTabs = allTabs.filter((t: any) => t.openerTabId === parentTab.id);
            expect(childTabs.length).toBe(2);

            const beforeWindows = await getAllWindowsViaSW(context);

            await invokeCommand(parent, 'cmd_tab_detach_magic_children');
            await waitForWindowCount(context, beforeWindows.length + 1);
            await new Promise(r => setTimeout(r, 500));

            const afterWindows = await getAllWindowsViaSW(context);
            expect(afterWindows.length).toBe(beforeWindows.length + 1);

            const afterOriginalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
            const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

            expect(afterOriginalWindow).toBeDefined();
            expect(newWindow).toBeDefined();
            // Original window should have only the parent tab
            expect(afterOriginalWindow!.tabs.length).toBe(1);
            // New window should have the 2 children
            expect(newWindow!.tabs.length).toBe(2);
            if (DEBUG) console.log(`cmd_tab_detach_magic_children: original ${afterOriginalWindow!.tabs.length} tab, new ${newWindow!.tabs.length} tabs`);

            // Cleanup
            await new Promise(r => setTimeout(r, 300));
            await closeExtraWindows(originalWindowId);
        });
    });
});
