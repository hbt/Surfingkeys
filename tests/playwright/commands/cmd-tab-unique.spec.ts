import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, openSiblingTabViaSW } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_tab_unique';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const UNIQUE_ID = 'cmd_tab_unique';

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
        });
    });
}

async function activateTabViaSW(ctx: BrowserContext, tabId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { active: true }, () => resolve());
        });
    }, tabId);
}

test.describe('cmd_tab_unique (Playwright)', () => {
    test.setTimeout(30_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
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

    test('no duplicates — tab count unchanged', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                // Open a second tab with a different URL
                const FIXTURE_URL_2 = `${FIXTURE_BASE}/default.html`;
                await openSiblingTabViaSW(context, FIXTURE_URL_2);
                await anchor.waitForTimeout(300);

                const tabsBefore = await getTabsViaSW(context);
                const countBefore = tabsBefore.length;

                // Activate anchor and invoke
                const anchorInfo = tabsBefore.find((t: any) => t.url && t.url.includes('cov_content_anchor'));
                if (anchorInfo) await activateTabViaSW(context, anchorInfo.id);
                await anchor.bringToFront();
                await anchor.waitForTimeout(200);

                const ok = await invokeCommand(anchor, UNIQUE_ID);
                expect(ok).toBe(true);
                await anchor.waitForTimeout(500);

                const tabsAfter = await getTabsViaSW(context);
                expect(tabsAfter.length).toBe(countBefore);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/no_duplicates/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/no_duplicates/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('2 tabs with same URL — 1 removed, keeps first', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                // Open a duplicate of anchor URL
                await openSiblingTabViaSW(context, CONTENT_COVERAGE_URL);
                await anchor.waitForTimeout(300);

                const tabsBefore = await getTabsViaSW(context);
                expect(tabsBefore.length).toBe(2);

                // Activate anchor and invoke
                const anchorInfo = tabsBefore.sort((a: any, b: any) => a.index - b.index)[0];
                await activateTabViaSW(context, anchorInfo.id);
                await anchor.bringToFront();
                await anchor.waitForTimeout(200);

                const ok = await invokeCommand(anchor, UNIQUE_ID);
                expect(ok).toBe(true);
                await anchor.waitForTimeout(500);

                const tabsAfter = await getTabsViaSW(context);
                expect(tabsAfter.length).toBe(1);
                // Kept the first (lowest index) tab
                expect(tabsAfter[0].id).toBe(anchorInfo.id);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/two_dupes/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/two_dupes/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('3 duplicates of same URL — 2 removed, keeps first', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                // Open 2 more duplicates of the same URL
                await openSiblingTabViaSW(context, CONTENT_COVERAGE_URL);
                await openSiblingTabViaSW(context, CONTENT_COVERAGE_URL);
                await anchor.waitForTimeout(300);

                const tabsBefore = await getTabsViaSW(context);
                expect(tabsBefore.length).toBe(3);

                const firstTab = tabsBefore.sort((a: any, b: any) => a.index - b.index)[0];
                await activateTabViaSW(context, firstTab.id);
                await anchor.bringToFront();
                await anchor.waitForTimeout(200);

                const ok = await invokeCommand(anchor, UNIQUE_ID);
                expect(ok).toBe(true);
                await anchor.waitForTimeout(500);

                const tabsAfter = await getTabsViaSW(context);
                expect(tabsAfter.length).toBe(1);
                expect(tabsAfter[0].id).toBe(firstTab.id);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/three_dupes/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/three_dupes/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('mixed URLs with some duplicates — only dupes removed', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                // Open: unique URL, duplicate of anchor, another unique URL, another duplicate of anchor
                const UNIQUE_URL = `${FIXTURE_BASE}/default.html`;
                await openSiblingTabViaSW(context, UNIQUE_URL);
                await openSiblingTabViaSW(context, CONTENT_COVERAGE_URL); // dupe of anchor
                await openSiblingTabViaSW(context, UNIQUE_URL);            // dupe of UNIQUE_URL
                await anchor.waitForTimeout(300);

                const tabsBefore = await getTabsViaSW(context);
                expect(tabsBefore.length).toBe(4);

                // Activate anchor and invoke
                const sortedBefore = tabsBefore.sort((a: any, b: any) => a.index - b.index);
                await activateTabViaSW(context, sortedBefore[0].id);
                await anchor.bringToFront();
                await anchor.waitForTimeout(200);

                const ok = await invokeCommand(anchor, UNIQUE_ID);
                expect(ok).toBe(true);
                await anchor.waitForTimeout(500);

                // 4 tabs → 2 unique URLs → 2 tabs should remain
                const tabsAfter = await getTabsViaSW(context);
                expect(tabsAfter.length).toBe(2);

                // The two remaining tabs should have distinct URLs
                const urls = tabsAfter.map((t: any) => t.url);
                const uniqueUrls = new Set(urls);
                expect(uniqueUrls.size).toBe(2);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/mixed_dupes/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/mixed_dupes/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });
});
