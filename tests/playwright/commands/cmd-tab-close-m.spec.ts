import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, openSiblingTabViaSW } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'gX';
const UNIQUE_ID = 'cmd_tab_close_m';

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

async function setConf(page: Page, key: string, value: unknown) {
    await page.evaluate(([k, v]) => {
        document.dispatchEvent(new CustomEvent('__sk_conf_override', {
            detail: { key: k, value: v }
        }));
    }, [key, value] as [string, unknown]);
    await page.waitForTimeout(50);
}

async function waitForTabCount(activePage: Page, expected: number) {
    const ctx = activePage.context();
    for (let i = 0; i < 50; i++) {
        await activePage.waitForTimeout(100).catch(() => {});
        if (ctx.pages().length <= expected) break;
    }
}

test.describe('cmd_tab_close_m (pending-key, Playwright)', () => {
    test.setTimeout(20_000);

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

    test('gXt closes only the current tab', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const left = await context.newPage();
                await left.goto(FIXTURE_URL, { waitUntil: 'load' });
                const right = await context.newPage();
                await right.goto(FIXTURE_URL, { waitUntil: 'load' });

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 't': 'CurrentTab' });

                const countBefore = context.pages().length;

                const closePromise = anchor.waitForEvent('close');
                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('t').catch(() => {});
                await closePromise;
                await new Promise(r => setTimeout(r, 300));

                // After close, check remaining pages in context
                expect(context.pages().length).toBe(countBefore - 1);
                if (DEBUG) console.log(`gXt: ${countBefore} → ${context.pages().length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXt/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gXt/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXc closes all tabs except active', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                for (let i = 0; i < 3; i++) {
                    const p = await context.newPage();
                    await p.goto(FIXTURE_URL, { waitUntil: 'load' });
                    await p.waitForTimeout(200);
                }

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'c': 'AllExceptActive' });

                const beforeCount = context.pages().length;
                expect(beforeCount).toBeGreaterThanOrEqual(4);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('c');

                await waitForTabCount(anchor, 1);
                expect(context.pages().length).toBe(1);
                if (DEBUG) console.log(`gXc: ${beforeCount} → ${context.pages().length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXc/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gXc/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXl closes tabs to the right', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const right1 = await context.newPage();
                await right1.goto(FIXTURE_URL, { waitUntil: 'load' });
                const right2 = await context.newPage();
                await right2.goto(FIXTURE_URL, { waitUntil: 'load' });

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'l': 'DirectionRight' });

                const countBefore = context.pages().length;
                expect(countBefore).toBe(3);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('l');

                await waitForTabCount(anchor, 1);
                expect(context.pages().length).toBe(1);
                if (DEBUG) console.log(`gXl: ${countBefore} → ${context.pages().length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXl/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gXl/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---- helper functions used by new tests ----

    async function getTabsViaSW(): Promise<any[]> {
        const sw = context.serviceWorkers()[0];
        if (!sw) throw new Error('No service worker found');
        return sw.evaluate(() => {
            return new Promise<any[]>((resolve) => {
                chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
            });
        });
    }

    async function getAllTabsViaSW(): Promise<any[]> {
        const sw = context.serviceWorkers()[0];
        if (!sw) throw new Error('No service worker found');
        return sw.evaluate(() => {
            return new Promise<any[]>((resolve) => {
                chrome.tabs.query({}, (tabs: any[]) => resolve(tabs));
            });
        });
    }

    async function getActiveTabViaSW(): Promise<any> {
        const sw = context.serviceWorkers()[0];
        if (!sw) throw new Error('No service worker found');
        return sw.evaluate(() => {
            return new Promise<any>((resolve) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
            });
        });
    }

    async function openChildTabViaSW(openerTabId: number, url: string): Promise<number> {
        const sw = context.serviceWorkers()[0];
        if (!sw) throw new Error('No service worker found');
        return sw.evaluate(({ openerTabId, url }) => {
            return new Promise<number>((resolve) => {
                chrome.tabs.create({ url, openerTabId, active: false }, (tab: any) => resolve(tab.id));
            });
        }, { openerTabId, url });
    }

    async function openWindowViaSW(url: string): Promise<number> {
        const sw = context.serviceWorkers()[0];
        if (!sw) throw new Error('No service worker found');
        return sw.evaluate((url: string) => {
            return new Promise<number>((resolve) => {
                chrome.windows.create({ url }, (win: any) => resolve(win.id));
            });
        }, url);
    }

    async function closeWindowViaSW(windowId: number): Promise<void> {
        const sw = context.serviceWorkers()[0];
        if (!sw) throw new Error('No service worker found');
        await sw.evaluate((windowId: number) => {
            return new Promise<void>((resolve) => {
                chrome.windows.remove(windowId, () => resolve());
            });
        }, windowId);
    }

    async function waitForHttpPageCount(expected: number) {
        for (let i = 0; i < 50; i++) {
            const httpCount = context.pages().filter(p => p.url().startsWith('http')).length;
            if (httpCount <= expected) break;
            await new Promise(r => setTimeout(r, 100));
        }
    }

    // ---- new tests ----

    test('gXh closes tabs to the left (DirectionLeft)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Setup: [left1, left2, anchor, right]
                // anchor is the active tab; left1 and left2 should be closed
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                // Close anchor, open lefts, re-open anchor, open right
                await anchor.close();

                const left1 = await context.newPage();
                await left1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await left1.waitForTimeout(200);

                const left2 = await context.newPage();
                await left2.goto(FIXTURE_URL, { waitUntil: 'load' });
                await left2.waitForTimeout(200);

                const anchor2 = await context.newPage();
                await anchor2.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await anchor2.waitForTimeout(200);

                const right = await context.newPage();
                await right.goto(FIXTURE_URL, { waitUntil: 'load' });
                await right.waitForTimeout(200);

                await anchor2.bringToFront();
                await anchor2.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor2, 'unmapAllExcept', []);
                await callSKApi(anchor2, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor2, 'magicKeys', { 'h': 'DirectionLeft' });

                const tabsBefore = await getTabsViaSW();
                const anchorTab = tabsBefore.find((t: any) => t.url.includes(CONTENT_COVERAGE_URL.split('#')[1] ?? CONTENT_COVERAGE_URL));
                const leftCount = anchorTab ? tabsBefore.filter((t: any) => t.index < anchorTab.index).length : 2;
                const countBefore = context.pages().length;
                expect(countBefore).toBe(4);

                await anchor2.keyboard.press('g');
                await anchor2.waitForTimeout(50);
                await anchor2.keyboard.press('X');
                await anchor2.waitForTimeout(50);
                await anchor2.keyboard.press('h');

                await waitForHttpPageCount(countBefore - leftCount);
                const httpPagesAfter = context.pages().filter(p => p.url().startsWith('http')).length;
                expect(httpPagesAfter).toBeLessThanOrEqual(countBefore - leftCount);
                if (DEBUG) console.log(`gXh: ${countBefore} → ${context.pages().length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXh/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gXh/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXL closes current tab and all tabs to the right (DirectionRightInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Setup: [left, anchor, right1, right2]
                // anchor + right1 + right2 = 3 tabs closed, left survives
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const right1 = await context.newPage();
                await right1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await right1.waitForTimeout(200);

                const right2 = await context.newPage();
                await right2.goto(FIXTURE_URL, { waitUntil: 'load' });
                await right2.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'L': 'DirectionRightInclusive' });

                const countBefore = context.pages().length;
                expect(countBefore).toBe(3);

                // anchor is being closed — fire content flush before invoking
                const contentFlushPromise = covContent?.flush(`${SUITE_LABEL}/gXL/content`).catch(() => null) ?? Promise.resolve(null);

                const closePromise = anchor.waitForEvent('close');
                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('L').catch(() => {});
                await closePromise.catch(() => {});
                await new Promise(r => setTimeout(r, 500));

                // Chrome won't fully close last tab; expect at most 1 http page
                await waitForHttpPageCount(0);
                const httpPagesAfter = context.pages().filter(p => p.url().startsWith('http')).length;
                expect(httpPagesAfter).toBeLessThanOrEqual(1);
                if (DEBUG) console.log(`gXL: ${countBefore} → ${context.pages().length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXL/command_window/background`) ?? null;
                const contentPath = await contentFlushPromise;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXH closes current tab and all tabs to the left (DirectionLeftInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Setup: [left1, left2, anchor, right]
                // left1 + left2 + anchor = 3 tabs closed, right survives
                const base = await context.newPage();
                await base.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(base);

                const left2 = await context.newPage();
                await left2.goto(FIXTURE_URL, { waitUntil: 'load' });
                await left2.waitForTimeout(200);

                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await anchor.waitForTimeout(200);

                const right = await context.newPage();
                await right.goto(FIXTURE_URL, { waitUntil: 'load' });
                await right.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'H': 'DirectionLeftInclusive' });

                const countBefore = context.pages().length;
                expect(countBefore).toBe(4);

                // anchor is being closed — fire content flush before invoking
                const contentFlushPromise = covContent?.flush(`${SUITE_LABEL}/gXH/content`).catch(() => null) ?? Promise.resolve(null);

                const closePromise = anchor.waitForEvent('close');
                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('H').catch(() => {});
                await closePromise.catch(() => {});
                await new Promise(r => setTimeout(r, 500));

                // 3 tabs closed (left1, left2, anchor), right survives — expect at most 1 http page
                await waitForHttpPageCount(1);
                const httpPagesAfter = context.pages().filter(p => p.url().startsWith('http')).length;
                expect(httpPagesAfter).toBeLessThanOrEqual(1);
                if (DEBUG) console.log(`gXH: ${countBefore} → ${context.pages().length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXH/command_window/background`) ?? null;
                const contentPath = await contentFlushPromise;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXa closes all tabs in window including active (AllInWindow)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const extra = await context.newPage();
                await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
                await extra.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'a': 'AllInWindow' });

                const countBefore = context.pages().length;
                expect(countBefore).toBeGreaterThanOrEqual(2);

                // anchor is being closed — fire content flush before invoking
                const contentFlushPromise = covContent?.flush(`${SUITE_LABEL}/gXa/content`).catch(() => null) ?? Promise.resolve(null);

                const closePromise = anchor.waitForEvent('close');
                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('a').catch(() => {});
                await closePromise.catch(() => {});
                await new Promise(r => setTimeout(r, 500));

                // Chrome keeps the last tab alive rather than closing the window entirely
                await waitForHttpPageCount(0);
                const httpPages = context.pages().filter(p => p.url().startsWith('http')).length;
                expect(httpPages).toBeLessThanOrEqual(1);
                if (DEBUG) console.log(`gXa: ${countBefore} → ${context.pages().length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXa/command_window/background`) ?? null;
                const contentPath = await contentFlushPromise;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXA closes all tabs except active across all windows (AllExceptActiveAllWindows)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                // Extra tab in current window (will be closed)
                const extra = await context.newPage();
                await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
                await extra.waitForTimeout(200);

                // 2nd window with a tab (will be closed)
                const win2Id = await openWindowViaSW(FIXTURE_URL);
                await anchor.waitForTimeout(500);

                const allTabsBefore = await getAllTabsViaSW();
                const anchorTab = allTabsBefore.find((t: any) => t.active && t.windowId !== win2Id);
                const currentWindowId = anchorTab?.windowId;
                expect(allTabsBefore.length).toBeGreaterThanOrEqual(3);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'A': 'AllExceptActiveAllWindows' });

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('A');
                await anchor.waitForTimeout(1000);

                const allTabsAfter = await getAllTabsViaSW();
                const win2TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win2Id);
                const currentWindowTabsAfter = allTabsAfter.filter((t: any) => t.windowId === currentWindowId);
                expect(win2TabsAfter.length).toBe(0);
                expect(currentWindowTabsAfter.length).toBe(1); // only anchor survives
                if (DEBUG) console.log(`gXA: before=${allTabsBefore.length} → after=${allTabsAfter.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXA/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gXA/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXk closes child tabs of active tab (ChildrenTabs)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const parent = await context.newPage();
                await parent.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(parent);

                // Open sibling tabs (not children of parent)
                const sibling1 = await openSiblingTabViaSW(context, FIXTURE_URL);
                await sibling1.waitForTimeout(200);
                const sibling2 = await openSiblingTabViaSW(context, FIXTURE_URL);
                await sibling2.waitForTimeout(200);

                await parent.bringToFront();
                await parent.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);

                const parentTab = await getActiveTabViaSW();

                // Open child tabs of parent
                const child1Id = await openChildTabViaSW(parentTab.id, FIXTURE_URL);
                const child2Id = await openChildTabViaSW(parentTab.id, FIXTURE_URL);

                await parent.waitForTimeout(600);
                await parent.bringToFront();
                await parent.waitForTimeout(300);

                const beforeCount = context.pages().length;
                const allTabs = await getTabsViaSW();
                const childTabs = allTabs.filter((t: any) => t.openerTabId === parentTab.id);
                expect(childTabs.length).toBe(2);

                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(parent, 'unmapAllExcept', []);
                await callSKApi(parent, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(parent, 'magicKeys', { 'k': 'ChildrenTabs' });

                await parent.keyboard.press('g');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('X');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('k');

                await waitForTabCount(parent, beforeCount - 2);

                const afterCount = context.pages().length;
                expect(afterCount).toBe(beforeCount - 2);

                const remainingTabs = await getTabsViaSW();
                const remainingIds = new Set(remainingTabs.map((t: any) => t.id));
                expect(remainingIds.has(child1Id)).toBe(false);
                expect(remainingIds.has(child2Id)).toBe(false);

                if (DEBUG) console.log(`gXk: ${beforeCount} → ${afterCount}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXk/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gXk/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXK closes child and grandchild tabs recursively (ChildrenTabsRecursively)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const parent = await context.newPage();
                await parent.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(parent);

                const sibling = await openSiblingTabViaSW(context, FIXTURE_URL);
                await sibling.waitForTimeout(200);

                await parent.bringToFront();
                await parent.waitForTimeout(300);

                await callSKApi(parent, 'unmapAllExcept', []);
                await callSKApi(parent, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(parent, 'magicKeys', { 'K': 'ChildrenTabsRecursively' });

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);

                const parentTab = await getActiveTabViaSW();

                // parent → child → grandchild
                const childId = await openChildTabViaSW(parentTab.id, FIXTURE_URL);
                await parent.waitForTimeout(300);

                const grandchildId = await openChildTabViaSW(childId, FIXTURE_URL);
                await parent.waitForTimeout(300);

                await parent.bringToFront();
                await parent.waitForTimeout(300);

                const beforeCount = context.pages().length;

                await covBg?.snapshot();
                await covContent?.snapshot();

                await parent.keyboard.press('g');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('X');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('K');

                // child + grandchild = 2 tabs closed, sibling + parent survive
                await waitForTabCount(parent, beforeCount - 2);

                const afterCount = context.pages().length;
                expect(afterCount).toBe(beforeCount - 2);

                const remainingTabs = await getAllTabsViaSW();
                const remainingIds = new Set(remainingTabs.map((t: any) => t.id));
                expect(remainingIds.has(childId)).toBe(false);
                expect(remainingIds.has(grandchildId)).toBe(false);
                expect(remainingIds.has(parentTab.id)).toBe(true);

                if (DEBUG) console.log(`gXK: ${beforeCount} → ${afterCount}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXK/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gXK/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXw closes non-pinned tabs in other windows (OtherWindowsNoPinned)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const sw = context.serviceWorkers()[0];

                // 2nd window: no pinned tabs → should be closed
                const win2Id = await openWindowViaSW(FIXTURE_URL);
                await anchor.waitForTimeout(500);

                // 3rd window: has a pinned tab → should NOT be closed
                const win3Id = await openWindowViaSW(FIXTURE_URL);
                await anchor.waitForTimeout(500);

                // Pin the tab in win3
                const allTabsBefore = await getAllTabsViaSW();
                const win3Tab = allTabsBefore.find((t: any) => t.windowId === win3Id);
                await sw.evaluate((tabId: number) => {
                    return new Promise<void>((resolve) => {
                        chrome.tabs.update(tabId, { pinned: true }, () => resolve());
                    });
                }, win3Tab.id);
                await anchor.waitForTimeout(300);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'w': 'OtherWindowsNoPinned' });

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('w');
                await anchor.waitForTimeout(1000);

                const allTabsAfter = await getAllTabsViaSW();
                const win2TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win2Id);
                const win3TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win3Id);

                expect(win2TabsAfter.length).toBe(0);   // no pinned → closed
                expect(win3TabsAfter.length).toBeGreaterThan(0); // has pinned → survives

                // Cleanup win3
                await closeWindowViaSW(win3Id).catch(() => {});

                if (DEBUG) console.log(`gXw: win2 closed, win3 (pinned) survived`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXw/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gXw/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXW closes all tabs in other windows (AllOtherWindowsTabs)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const beforeCurrentWindow = context.pages().length;

                // Open a 2nd window with 2 tabs via SW
                const win2Id = await openWindowViaSW(FIXTURE_URL);
                await anchor.waitForTimeout(500);
                const sw = context.serviceWorkers()[0];
                await sw.evaluate(({ win2Id, url }: { win2Id: number; url: string }) => {
                    return new Promise<void>((resolve) => {
                        chrome.tabs.create({ windowId: win2Id, url, active: false }, () => resolve());
                    });
                }, { win2Id, url: FIXTURE_URL });
                await anchor.waitForTimeout(500);

                const allTabsBefore = await getAllTabsViaSW();
                const win2Tabs = allTabsBefore.filter((t: any) => t.windowId === win2Id);
                expect(win2Tabs.length).toBeGreaterThanOrEqual(1);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'W': 'AllOtherWindowsTabs' });

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('W');
                await anchor.waitForTimeout(1000);

                const allTabsAfter = await getAllTabsViaSW();
                const win2TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win2Id);
                expect(win2TabsAfter.length).toBe(0);

                // Current window tabs should be intact
                const currentWindowId = (await anchor.evaluate(() => null), allTabsBefore.find((t: any) => t.url.includes(CONTENT_COVERAGE_URL.replace('#', '').split('cov')[0])))?.windowId;
                const currentWindowTabsAfter = allTabsAfter.filter((t: any) => t.windowId !== win2Id);
                expect(currentWindowTabsAfter.length).toBe(beforeCurrentWindow);

                if (DEBUG) console.log(`gXW: other window tabs removed`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXW/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gXW/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gXd closes all same-domain tabs (SameDomain)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                // Same domain as anchor (localhost)
                const same1 = await context.newPage();
                await same1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await same1.waitForTimeout(200);

                // Different domain: about:blank has empty hostname — will not be closed
                const different = await context.newPage();
                await different.goto('about:blank', { waitUntil: 'load' });
                await different.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'd': 'SameDomain' });

                const countBefore = context.pages().length;
                expect(countBefore).toBe(3);

                // anchor + same1 (localhost) will close; different (about:blank) will not
                const closePromise = anchor.waitForEvent('close');
                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('X');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('d').catch(() => {});
                await closePromise;
                await new Promise(r => setTimeout(r, 500));

                // Only the about:blank tab should remain
                expect(context.pages().length).toBe(1);
                const remaining = context.pages()[0];
                expect(remaining.url()).toBe('about:blank');

                if (DEBUG) console.log(`gXd: ${countBefore} → ${context.pages().length} pages, remaining url=${remaining.url()}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gXd/command_window/background`) ?? null;
                await covContent?.close().catch(() => {});
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
            },
        );
    });
});
