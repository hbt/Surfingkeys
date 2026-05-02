import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_detach_magic_other_windows';
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

test.describe('cmd_tab_detach_magic_other_windows (Playwright)', () => {
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

    test('cmd_tab_detach_magic_other_windows moves other windows into a new window', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/other_windows`)}`;
                const anchor = await context.newPage();
                await anchor.goto(anchorUrl, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const currentWindowId = (await getAllWindowsViaSW(context))[0].id;

                // One other window with two tabs. Both tabs should move into one new window.
                const otherWindowId = await openWindowViaSW(context, FIXTURE_URL);
                await anchor.waitForTimeout(400);
                const sw = context.serviceWorkers()[0];
                await sw.evaluate(({ otherWindowId, url }: { otherWindowId: number; url: string }) => {
                    return new Promise<void>((resolve) => {
                        chrome.tabs.create({ windowId: otherWindowId, url, active: false }, () => resolve());
                    });
                }, { otherWindowId, url: FIXTURE_URL });
                await anchor.waitForTimeout(400);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(anchorUrl);

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;

                await covBg?.snapshot();
                await covContent?.snapshot();

                await invokeCommand(anchor, 'cmd_tab_detach_magic_other_windows');
                await anchor.waitForTimeout(1000);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount);

                const currentWindow = afterWindows.find((w: any) => w.id === currentWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== currentWindowId);

                expect(currentWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                expect(currentWindow!.tabs.length).toBe(1);
                expect(newWindow!.tabs.length).toBe(2);

                if (DEBUG) console.log(`cmd_tab_detach_magic_other_windows: windows ${beforeCount} → ${afterWindows.length}`);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();

                const sw2 = context.serviceWorkers()[0];
                await sw2.evaluate((id: number) => {
                    return new Promise<void>((resolve) => {
                        chrome.windows.remove(id, () => resolve());
                    });
                }, newWindow!.id).catch(() => {});
                await new Promise(r => setTimeout(r, 300));
            },
        );
    });
});
