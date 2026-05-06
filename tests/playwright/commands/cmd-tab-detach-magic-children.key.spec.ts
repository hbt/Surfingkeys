import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_detach_magic_children_key';
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

test.describe('cmd_tab_detach_magic_children_key (Playwright)', () => {
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

    test('cmd_tab_detach_magic_children detaches child tabs into a new window via tdk', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const parentUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/via_tdk`)}`;
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

                const parentTab = await getActiveTabViaSW(context);
                const child1Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
                const child2Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
                await parent.waitForTimeout(300);

                await callSKApi(parent, 'unmapAllExcept', []);
                await callSKApi(parent, 'mapcmdkey', 'tdk', 'cmd_tab_detach_magic_children');

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await covBg?.snapshot();
                await covContent?.snapshot();

                await parent.keyboard.press('t');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('d');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('k');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                expect(originalWindow!.tabs.length).toBe(3);
                expect(newWindow!.tabs.length).toBe(2);

                const remainingTabs = new Set(afterWindows.flatMap((w: any) => (w.tabs ?? []).map((t: any) => t.id)));
                expect(remainingTabs.has(child1Id)).toBe(true);
                expect(remainingTabs.has(child2Id)).toBe(true);
                expect(remainingTabs.has(parentTab.id)).toBe(true);

                if (DEBUG) console.log(`cmd_tab_detach_magic_children_key: windows ${beforeCount} → ${afterWindows.length}`);

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
                }, newWindow!.id).catch(() => {});
                await new Promise(r => setTimeout(r, 300));
            },
        );
    });
});
