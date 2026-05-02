import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_copy_urls_magic';
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

async function writeClipboard(page: Page, value: string): Promise<void> {
    await page.evaluate((text) => navigator.clipboard.writeText(text), value);
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
    return sw.evaluate(([createUrls, isIncognito]) => {
        return new Promise<any>((resolve) => {
            chrome.windows.create({ url: createUrls, incognito: isIncognito }, (window: any) => resolve(window));
        });
    }, [urls, incognito]);
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

async function getCurrentWindowTabs(ctx: BrowserContext, currentWindowId: number): Promise<any[]> {
    const allTabs = await getAllTabsViaSW(ctx);
    return allTabs
        .filter((tab) => tab.windowId === currentWindowId)
        .sort((a, b) => a.index - b.index);
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

test.describe('cmd_tab_copy_urls_magic (Playwright)', () => {
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

    test('cmd_tab_copy_urls_magic_current copies the active tab URL', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/current`)}`;
                const anchor = await createPage(anchorUrl);
                await closeAllExcept(anchor);
                const covContent = await initContentCoverageForUrl?.(anchorUrl);

                await writeClipboard(anchor, 'seed');
                await covBg?.snapshot();
                await covContent?.snapshot();
                await expectClipboardForCommand(anchor, 'cmd_tab_copy_urls_magic_current', [anchorUrl]);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });

    test('cmd_tab_copy_urls_magic_all_window copies all URLs in current window', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/all_window_anchor`)}`;
                const anchor = await createPage(anchorUrl);
                await closeAllExcept(anchor);
                const extra1 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/all_window_1`)}`;
                const extra2 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/all_window_2`)}`;
                await createPage(extra1);
                await createPage(extra2);
                await anchor.bringToFront();
                await anchor.waitForTimeout(200);

                const covContent = await initContentCoverageForUrl?.(anchorUrl);
                const anchorTab = (await getAllTabsViaSW(context)).find((tab) => tab.url === anchorUrl);
                const expectedUrls = (await getCurrentWindowTabs(context, anchorTab.windowId)).map((tab) => tab.url);

                await covBg?.snapshot();
                await covContent?.snapshot();
                await expectClipboardForCommand(anchor, 'cmd_tab_copy_urls_magic_all_window', expectedUrls);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });

    test('cmd_tab_copy_urls_magic_all_windows copies all tabs except the active tab across all windows', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/all_windows_anchor`)}`;
                const anchor = await createPage(anchorUrl);
                await closeAllExcept(anchor);
                const sameWindow = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/all_windows_same`)}`;
                await createPage(sameWindow);

                const otherWindow = await createPage(`${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/all_windows_other`)}`);
                await otherWindow.evaluate(() => window.open('about:blank', '_blank'));
                await otherWindow.waitForTimeout(300);
                await anchor.bringToFront();
                await anchor.waitForTimeout(200);

                const covContent = await initContentCoverageForUrl?.(anchorUrl);
                const allTabs = await getAllTabsViaSW(context);
                const anchorTab = allTabs.find((tab) => tab.url === anchorUrl);
                const expectedUrls = allTabs.filter((tab) => tab.id !== anchorTab.id).map((tab) => tab.url);

                await covBg?.snapshot();
                await covContent?.snapshot();
                await expectClipboardForCommand(anchor, 'cmd_tab_copy_urls_magic_all_windows', expectedUrls);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });

    test('cmd_tab_copy_urls_magic_children_recursive copies descendant tabs in opener order', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const parentUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/children_recursive_parent`)}`;
                const childUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/children_recursive_child`)}`;
                const grandchildUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/children_recursive_grandchild`)}`;

                const parent = await createPage(parentUrl);
                await closeAllExcept(parent);
                const sibling = await createPage(`${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/children_recursive_sibling`)}`);
                await sibling.waitForTimeout(200);
                await parent.bringToFront();
                await parent.waitForTimeout(300);

                const parentTab = await getActiveTabViaSW(context);
                const childId = await openChildTabViaSW(context, parentTab.id, childUrl);
                await parent.waitForTimeout(300);
                await openChildTabViaSW(context, childId, grandchildUrl);
                await parent.waitForTimeout(400);

                const covContent = await initContentCoverageForUrl?.(parentUrl);
                await covBg?.snapshot();
                await covContent?.snapshot();
                await expectClipboardForCommand(parent, 'cmd_tab_copy_urls_magic_children_recursive', [childUrl, grandchildUrl]);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });

    test('cmd_tab_copy_urls_magic_left preserves tabHandleMagic order with repeats', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const left2 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_2`)}`;
                const left1 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_1`)}`;
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_right_anchor`)}`;
                const right1 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/right_1`)}`;
                const right2 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/right_2`)}`;

                await closeAllExcept(await createPage(left2));
                await createPage(left1);
                const anchor = await createPage(anchorUrl);
                await createPage(right1);
                await createPage(right2);
                await anchor.bringToFront();
                await anchor.waitForTimeout(200);

                const covContent = await initContentCoverageForUrl?.(anchorUrl);

                await covBg?.snapshot();
                await covContent?.snapshot();
                await expectClipboardForCommand(anchor, 'cmd_tab_copy_urls_magic_left', [left1, left2], 2);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });

    test('cmd_tab_copy_urls_magic_right_inclusive copies current and all tabs to the right', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const left1 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/inclusive_left`)}`;
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/inclusive_anchor`)}`;
                const right1 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/inclusive_1`)}`;
                const right2 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/inclusive_2`)}`;

                await closeAllExcept(await createPage(left1));
                const anchor = await createPage(anchorUrl);
                await createPage(right1);
                await createPage(right2);
                await anchor.bringToFront();
                await anchor.waitForTimeout(200);

                const covContent = await initContentCoverageForUrl?.(anchorUrl);

                await covBg?.snapshot();
                await covContent?.snapshot();
                await expectClipboardForCommand(anchor, 'cmd_tab_copy_urls_magic_right_inclusive', [anchorUrl, right1]);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });

    test('cmd_tab_copy_urls_magic_right copies exactly 2 tabs to the right with repeats', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/repeat_anchor`)}`;
                const right1 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/repeat_1`)}`;
                const right2 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/repeat_2`)}`;
                const right3 = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/repeat_3`)}`;

                const anchor = await createPage(anchorUrl);
                await closeAllExcept(anchor);
                await createPage(right1);
                await createPage(right2);
                await createPage(right3);
                await anchor.bringToFront();
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(anchorUrl);
                await covBg?.snapshot();
                await covContent?.snapshot();
                await expectClipboardForCommand(anchor, 'cmd_tab_copy_urls_magic_right', [right1, right2], 2);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
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

    test('cmd_tab_copy_urls_magic_incognito copies incognito tabs and is a no-op when none exist', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/incognito_anchor`)}`;
                const anchor = await createPage(anchorUrl);
                await closeAllExcept(anchor);
                const covContent = await initContentCoverageForUrl?.(anchorUrl);

                await writeClipboard(anchor, 'before');
                await covBg?.snapshot();
                await covContent?.snapshot();
                const ok = await invokeCommand(anchor, 'cmd_tab_copy_urls_magic_incognito');
                expect(ok).toBe(true);
                await anchor.waitForTimeout(200);
                expect(await readClipboard(anchor)).toBe('before');

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });
});
