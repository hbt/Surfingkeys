import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_detach_magic_other_windows_no_pinned_key';
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

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a],
            bubbles: true,
            composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
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
        if (windows.length >= expected) return;
        await new Promise(r => setTimeout(r, 100));
    }
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

test.describe('cmd_tab_detach_magic_other_windows_no_pinned_key (Playwright)', () => {
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

    test('cmd_tab_detach_magic_other_windows_no_pinned detaches other no-pinned windows via tdw', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/via_tdw`)}`;
                const anchor = await context.newPage();
                await anchor.goto(anchorUrl, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const sw = context.serviceWorkers()[0];
                const otherWindowId = await sw.evaluate((url: string) => {
                    return new Promise<number>((resolve) => {
                        chrome.windows.create({ url }, (win: any) => resolve(win.id));
                    });
                }, `${FIXTURE_URL}#other_window`);
                await anchor.waitForTimeout(400);

                await sw.evaluate(({ windowId, url }: { windowId: number; url: string }) => {
                    return new Promise<void>((resolve) => {
                        chrome.tabs.create({ windowId, url, active: false }, () => resolve());
                    });
                }, { windowId: otherWindowId, url: `${FIXTURE_URL}#other_window_second` });
                await anchor.waitForTimeout(400);

                const allTabsBefore = await getAllWindowsViaSW(context);
                const otherWindowBefore = allTabsBefore.find((w: any) => w.id === otherWindowId);
                expect(otherWindowBefore?.tabs.length).toBe(2);
                const otherWindowTabIds = new Set((otherWindowBefore?.tabs ?? []).map((t: any) => t.id));

                const pinnedWindowId = await sw.evaluate((url: string) => {
                    return new Promise<number>((resolve) => {
                        chrome.windows.create({ url }, (win: any) => resolve(win.id));
                    });
                }, `${FIXTURE_URL}#pinned_window`);
                await anchor.waitForTimeout(400);

                const pinnedTabsBefore = await getAllWindowsViaSW(context);
                const pinnedTab = pinnedTabsBefore.find((w: any) => w.id === pinnedWindowId)?.tabs?.[0];
                expect(pinnedTab).toBeTruthy();
                await pinTabViaSW(context, pinnedTab.id);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(anchorUrl);

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', 'tdw', 'cmd_tab_detach_magic_other_windows_no_pinned');

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;

                await covBg?.snapshot();
                await covContent?.snapshot();

                await anchor.keyboard.press('t');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('d');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('w');

                await waitForWindowCount(context, beforeCount);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBeGreaterThanOrEqual(3);
                const pinnedWindowAfter = afterWindows.find((w: any) => w.id === pinnedWindowId);
                expect(pinnedWindowAfter?.tabs.length).toBe(1);

                const movedWindow = afterWindows.find((w: any) =>
                    w.id !== pinnedWindowId &&
                    w.id !== otherWindowId &&
                    w.tabs.some((t: any) => otherWindowTabIds.has(t.id)),
                );
                expect(movedWindow).toBeDefined();
                expect(movedWindow!.tabs.length).toBe(2);

                if (DEBUG) console.log(`cmd_tab_detach_magic_other_windows_no_pinned_key: windows ${beforeCount} → ${afterWindows.length}`);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });
});
