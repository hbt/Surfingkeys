import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_detach_magic_other_windows_no_pinned';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

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

async function getAllWindowsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.windows.getAll({ populate: true }, (windows: any[]) => resolve(windows));
        });
    });
}

async function waitForWindowCount(ctx: BrowserContext, expected: number, maxWaitMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const windows = await getAllWindowsViaSW(ctx);
        if (windows.length === expected) return;
        await new Promise(r => setTimeout(r, 100));
    }
}

async function openWindowViaSW(ctx: BrowserContext, url: string): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((targetUrl: string) => {
        return new Promise<number>((resolve) => {
            chrome.windows.create({ url: targetUrl }, (win: any) => resolve(win.id));
        });
    }, url);
}

async function pinTabViaSW(ctx: BrowserContext, tabId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { pinned: true }, () => resolve());
        });
    }, tabId);
}

test.describe('cmd_tab_detach_magic_other_windows_no_pinned (Playwright)', () => {
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

    test('cmd_tab_detach_magic_other_windows_no_pinned skips windows with pinned tabs', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/other_windows_no_pinned`)}`;
                const anchor = await context.newPage();
                await anchor.goto(anchorUrl, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const currentWindowId = (await getAllWindowsViaSW(context))[0].id;

                // One window without pinned tabs: should be detached into a new window.
                const unpinnedWindowId = await openWindowViaSW(context, `${FIXTURE_URL}#unpinned_marker`);
                await anchor.waitForTimeout(400);

                // One window with a pinned tab: should survive untouched.
                const pinnedWindowId = await openWindowViaSW(context, `${FIXTURE_URL}#pinned_marker`);
                await anchor.waitForTimeout(400);
                const tabs = await getAllWindowsViaSW(context);
                const pinnedWindow = tabs.find((w: any) => w.id === pinnedWindowId);
                const pinnedTab = pinnedWindow?.tabs?.[0];
                expect(pinnedTab).toBeDefined();
                await pinTabViaSW(context, pinnedTab.id);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(anchorUrl);

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;

                await covBg?.snapshot();
                await covContent?.snapshot();

                await invokeCommand(anchor, 'cmd_tab_detach_magic_other_windows_no_pinned');
                await anchor.waitForTimeout(1000);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount);

                const currentWindow = afterWindows.find((w: any) => w.id === currentWindowId);
                const pinnedWindowAfter = afterWindows.find((w: any) => w.id === pinnedWindowId);
                const unpinnedWindowAfter = afterWindows.find((w: any) => w.id === unpinnedWindowId);
                const detachedWindow = afterWindows.find((w: any) => w.id !== currentWindowId && w.id !== pinnedWindowId);

                expect(currentWindow).toBeDefined();
                expect(pinnedWindowAfter).toBeDefined();
                expect(detachedWindow).toBeDefined();
                expect(unpinnedWindowAfter).toBeUndefined();

                expect(currentWindow!.tabs.length).toBe(1);
                expect(pinnedWindowAfter!.tabs.length).toBe(1);
                expect(pinnedWindowAfter!.tabs[0].pinned).toBe(true);
                expect(detachedWindow!.tabs.length).toBe(1);

                if (DEBUG) console.log(`cmd_tab_detach_magic_other_windows_no_pinned: windows ${beforeCount} → ${afterWindows.length}`);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();

                const sw = context.serviceWorkers()[0];
                await sw.evaluate((id: number) => {
                    return new Promise<void>((resolve) => {
                        chrome.windows.remove(id, () => resolve());
                    });
                }, detachedWindow!.id).catch(() => {});
                await new Promise(r => setTimeout(r, 300));
            },
        );
    });
});
