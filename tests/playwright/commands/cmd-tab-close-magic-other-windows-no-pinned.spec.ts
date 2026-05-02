import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_magic_other_windows_no_pinned';
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

test.describe('cmd_tab_close_magic_other_windows_no_pinned (Playwright)', () => {
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
});
