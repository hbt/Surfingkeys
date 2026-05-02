import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_tab_copy_urls_magic_other_windows_no_pinned';
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

async function getAllTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({}, (tabs: any[]) => resolve(tabs));
        });
    });
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

async function createWindowViaSW(ctx: BrowserContext, urls: string[], incognito = false): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((args: [string[], boolean]) => {
        const [createUrls, isIncognito] = args;
        return new Promise<any>((resolve) => {
            chrome.windows.create({ url: createUrls, incognito: isIncognito }, (window: any) => resolve(window));
        });
    }, [urls, incognito] as [string[], boolean]);
}

async function closeAllExcept(keepPage: Page): Promise<void> {
    for (const p of context.pages()) {
        if (p !== keepPage) await p.close().catch(() => {});
    }
    await keepPage.bringToFront();
    await keepPage.waitForTimeout(200);
}

async function createPage(url: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    return page;
}

async function readClipboard(page: Page): Promise<string> {
    return page.evaluate(() => navigator.clipboard.readText());
}

async function expectClipboardForCommand(
    page: Page,
    uniqueId: string,
    expectedUrls: string[],
    repeats?: number,
): Promise<void> {
    const ok = await invokeCommand(page, uniqueId, repeats);
    expect(ok).toBe(true);
    await page.waitForTimeout(200);
    const clipboard = await readClipboard(page);
    expect(clipboard).toBe(expectedUrls.join('\n'));
}

test.describe('cmd_tab_copy_urls_magic_other_windows_no_pinned (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const p = await context.newPage();
        await p.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_tab_copy_urls_magic_other_windows_no_pinned skips windows with pinned tabs', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/other_windows_anchor`)}`;
                const anchor = await createPage(anchorUrl);
                await closeAllExcept(anchor);

                const eligibleUrls = [
                    `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/eligible`)}`,
                    `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/eligible_2`)}`,
                ];
                const pinnedUrls = [
                    `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/pinned`)}`,
                    `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/pinned_2`)}`,
                ];

                const eligibleWindow = await createWindowViaSW(context, eligibleUrls);
                const pinnedWindow = await createWindowViaSW(context, pinnedUrls);
                expect(eligibleWindow?.id).toBeTruthy();
                expect(pinnedWindow?.id).toBeTruthy();
                await anchor.waitForTimeout(500);

                const allTabs = await getAllTabsViaSW(context);
                const pinnedBaseTab = allTabs.find((tab) => tab.windowId === pinnedWindow.id && tab.url === pinnedUrls[0]);
                expect(pinnedBaseTab).toBeTruthy();
                await pinTabViaSW(context, pinnedBaseTab.id);
                await anchor.bringToFront();
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(anchorUrl);
                const expectedUrls = eligibleUrls;

                await covBg?.snapshot();
                await covContent?.snapshot();
                await expectClipboardForCommand(anchor, 'cmd_tab_copy_urls_magic_other_windows_no_pinned', expectedUrls);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });
});
