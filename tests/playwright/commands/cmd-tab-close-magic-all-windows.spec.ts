import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_magic_all_windows';
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

async function getAllTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({}, (tabs: any[]) => resolve(tabs));
        });
    });
}

test.describe('cmd_tab_close_magic_all_windows (Playwright)', () => {
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
});
