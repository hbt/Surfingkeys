import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, openSiblingTabViaSW } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_reload_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'gR';
const UNIQUE_ID = 'cmd_tab_reload_m';

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function callSKApi(p: Page, fn: string, ...args: unknown[]) {
    await p.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await p.waitForTimeout(100);
}

async function setConf(p: Page, key: string, value: unknown) {
    await p.evaluate(([k, v]) => {
        document.dispatchEvent(new CustomEvent('__sk_conf_override', {
            detail: { key: k, value: v }
        }));
    }, [key, value] as [string, unknown]);
    await p.waitForTimeout(50);
}

test.describe('cmd_tab_reload_m (pending-key, Playwright)', () => {
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

    // ---- tests ----

    test('gRt reloads the current tab', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 't': 'CurrentTab' });

                // Track navigation events to confirm reload
                const navPromise = anchor.waitForNavigation({ timeout: 5000 }).catch(() => null);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('t');

                await navPromise;
                await anchor.waitForTimeout(300);

                // Page should still be on the same URL after reload
                expect(anchor.url()).toContain('scroll-test.html');
                if (DEBUG) console.log(`gRt: page reloaded, url=${anchor.url()}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRt/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRt/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRe reloads tabs to the right (DirectionRight)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
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
                await setConf(anchor, 'magicKeys', { 'e': 'DirectionRight' });

                const tabsBefore = await getTabsViaSW();
                const countBefore = tabsBefore.length;
                expect(countBefore).toBe(3);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('e');
                await anchor.waitForTimeout(500);

                // Reload doesn't close tabs — count should be unchanged
                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(countBefore);
                if (DEBUG) console.log(`gRe: tab count ${countBefore} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRe/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRe/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRq reloads tabs to the left (DirectionLeft)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Setup: [left1, left2, anchor]
                const base = await context.newPage();
                await base.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(base);

                const left2 = await context.newPage();
                await left2.goto(FIXTURE_URL, { waitUntil: 'load' });
                await left2.waitForTimeout(200);

                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await anchor.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'q': 'DirectionLeft' });

                const tabsBefore = await getTabsViaSW();
                const countBefore = tabsBefore.length;
                expect(countBefore).toBe(3);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('q');
                await anchor.waitForTimeout(500);

                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(countBefore);
                if (DEBUG) console.log(`gRq: tab count ${countBefore} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRq/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRq/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRE reloads current tab and all tabs to the right (DirectionRightInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
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
                await setConf(anchor, 'magicKeys', { 'E': 'DirectionRightInclusive' });

                const tabsBefore = await getTabsViaSW();
                const countBefore = tabsBefore.length;
                expect(countBefore).toBe(3);

                // anchor is being reloaded — wait for navigation
                const navPromise = anchor.waitForNavigation({ timeout: 5000 }).catch(() => null);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('E');

                await navPromise;
                await anchor.waitForTimeout(500);

                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(countBefore);
                if (DEBUG) console.log(`gRE: tab count ${countBefore} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRE/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRE/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRQ reloads current tab and all tabs to the left (DirectionLeftInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Setup: [left1, left2, anchor, right]
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
                await setConf(anchor, 'magicKeys', { 'Q': 'DirectionLeftInclusive' });

                const tabsBefore = await getTabsViaSW();
                const countBefore = tabsBefore.length;
                expect(countBefore).toBe(4);

                // anchor is being reloaded — wait for navigation
                const navPromise = anchor.waitForNavigation({ timeout: 5000 }).catch(() => null);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('Q');

                await navPromise;
                await anchor.waitForTimeout(500);

                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(countBefore);
                if (DEBUG) console.log(`gRQ: tab count ${countBefore} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRQ/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRQ/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRc reloads all tabs except active (AllExceptActive)', async () => {
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

                const tabsBefore = await getTabsViaSW();
                const countBefore = tabsBefore.length;
                expect(countBefore).toBeGreaterThanOrEqual(4);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('c');
                await anchor.waitForTimeout(500);

                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(countBefore);
                if (DEBUG) console.log(`gRc: tab count ${countBefore} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRc/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRc/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRC reloads all tabs in window including active (AllInWindow)', async () => {
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
                await setConf(anchor, 'magicKeys', { 'C': 'AllInWindow' });

                const tabsBefore = await getTabsViaSW();
                const countBefore = tabsBefore.length;
                expect(countBefore).toBeGreaterThanOrEqual(2);

                // anchor is being reloaded — wait for navigation
                const navPromise = anchor.waitForNavigation({ timeout: 5000 }).catch(() => null);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('C');

                await navPromise;
                await anchor.waitForTimeout(500);

                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(countBefore);
                if (DEBUG) console.log(`gRC: tab count ${countBefore} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRC/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRC/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRg reloads all tabs except active across all windows (AllExceptActiveAllWindows)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                // Extra tab in current window
                const extra = await context.newPage();
                await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
                await extra.waitForTimeout(200);

                // 2nd window with a tab
                const win2Id = await openWindowViaSW(FIXTURE_URL);
                await anchor.waitForTimeout(500);

                const allTabsBefore = await getAllTabsViaSW();
                expect(allTabsBefore.length).toBeGreaterThanOrEqual(3);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'g': 'AllExceptActiveAllWindows' });

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(1000);

                const allTabsAfter = await getAllTabsViaSW();
                expect(allTabsAfter.length).toBe(allTabsBefore.length);
                // All tab IDs should still exist (reload doesn't close)
                const beforeIds = new Set(allTabsBefore.map((t: any) => t.id));
                const afterIds = new Set(allTabsAfter.map((t: any) => t.id));
                for (const id of beforeIds) {
                    expect(afterIds.has(id)).toBe(true);
                }
                if (DEBUG) console.log(`gRg: tab count before=${allTabsBefore.length} after=${allTabsAfter.length}`);

                // Cleanup
                await closeWindowViaSW(win2Id).catch(() => {});

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRg/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRg/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRk reloads child tabs of active tab (ChildrenTabs)', async () => {
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

                const tabsBefore = await getTabsViaSW();
                const childTabs = tabsBefore.filter((t: any) => t.openerTabId === parentTab.id);
                expect(childTabs.length).toBe(2);

                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(parent, 'unmapAllExcept', []);
                await callSKApi(parent, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(parent, 'magicKeys', { 'k': 'ChildrenTabs' });

                await parent.keyboard.press('g');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('R');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('k');
                await parent.waitForTimeout(600);

                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(tabsBefore.length);

                // Children still exist (reload, not close)
                const afterIds = new Set(tabsAfter.map((t: any) => t.id));
                expect(afterIds.has(child1Id)).toBe(true);
                expect(afterIds.has(child2Id)).toBe(true);
                if (DEBUG) console.log(`gRk: tab count ${tabsBefore.length} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRk/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRk/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRK reloads child and grandchild tabs recursively (ChildrenTabsRecursively)', async () => {
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

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                const parentTab = await getActiveTabViaSW();

                // parent → child → grandchild
                const childId = await openChildTabViaSW(parentTab.id, FIXTURE_URL);
                await parent.waitForTimeout(300);

                const grandchildId = await openChildTabViaSW(childId, FIXTURE_URL);
                await parent.waitForTimeout(300);

                await parent.bringToFront();
                await parent.waitForTimeout(300);

                const tabsBefore = await getTabsViaSW();

                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(parent, 'unmapAllExcept', []);
                await callSKApi(parent, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(parent, 'magicKeys', { 'K': 'ChildrenTabsRecursively' });

                await parent.keyboard.press('g');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('R');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('K');
                await parent.waitForTimeout(600);

                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(tabsBefore.length);

                // All tabs still exist (reload, not close)
                const afterIds = new Set(tabsAfter.map((t: any) => t.id));
                expect(afterIds.has(childId)).toBe(true);
                expect(afterIds.has(grandchildId)).toBe(true);
                expect(afterIds.has(parentTab.id)).toBe(true);
                if (DEBUG) console.log(`gRK: tab count ${tabsBefore.length} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRK/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRK/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRw reloads non-pinned tabs in other windows (OtherWindowsNoPinned)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const sw = context.serviceWorkers()[0];

                // 2nd window: no pinned tabs
                const win2Id = await openWindowViaSW(FIXTURE_URL);
                await anchor.waitForTimeout(500);

                // 3rd window: has a pinned tab
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
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('w');
                await anchor.waitForTimeout(1000);

                const allTabsAfter = await getAllTabsViaSW();
                // All tabs still exist (reload, not close)
                expect(allTabsAfter.length).toBe(allTabsBefore.length);
                if (DEBUG) console.log(`gRw: tab count ${allTabsBefore.length} → ${allTabsAfter.length} (unchanged)`);

                // Cleanup
                await closeWindowViaSW(win2Id).catch(() => {});
                await closeWindowViaSW(win3Id).catch(() => {});

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRw/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRw/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRW reloads all tabs in other windows (AllOtherWindowsTabs)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

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
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('W');
                await anchor.waitForTimeout(1000);

                const allTabsAfter = await getAllTabsViaSW();
                // All tabs still exist (reload, not close)
                expect(allTabsAfter.length).toBe(allTabsBefore.length);

                // Win2 tabs still exist
                const win2TabsAfter = allTabsAfter.filter((t: any) => t.windowId === win2Id);
                expect(win2TabsAfter.length).toBe(win2Tabs.length);
                if (DEBUG) console.log(`gRW: tab count ${allTabsBefore.length} → ${allTabsAfter.length} (unchanged)`);

                // Cleanup
                await closeWindowViaSW(win2Id).catch(() => {});

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRW/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gRW/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gRd reloads same-domain tabs (SameDomain)', async () => {
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

                // Different domain: about:blank has empty hostname — will not be reloaded
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

                const tabsBefore = await getTabsViaSW();
                expect(tabsBefore.length).toBe(3);

                // anchor + same1 (localhost) will be reloaded; different (about:blank) will not
                const navPromise = anchor.waitForNavigation({ timeout: 5000 }).catch(() => null);

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('R');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('d');

                await navPromise;
                await anchor.waitForTimeout(300);

                // Tab count unchanged — reload does not close tabs
                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(tabsBefore.length);

                // anchor still on its URL after reload
                expect(anchor.url()).toContain('scroll-test.html');

                // about:blank tab still at about:blank
                const differentStillExists = context.pages().some(p => p.url() === 'about:blank');
                expect(differentStillExists).toBe(true);

                if (DEBUG) console.log(`gRd: tab count ${tabsBefore.length} → ${tabsAfter.length} (unchanged), anchor url=${anchor.url()}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gRd/command_window/background`) ?? null;
                await covContent?.flush(`${SUITE_LABEL}/gRd/content`).catch(() => null);
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });
});
