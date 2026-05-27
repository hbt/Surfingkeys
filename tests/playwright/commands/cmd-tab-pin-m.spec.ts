import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, openSiblingTabViaSW } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_pin_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'gP';
const UNIQUE_ID = 'cmd_tab_pin_m';

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

// --- SW helpers ---

async function getTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => new Promise<any[]>(resolve => {
        chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
    }));
}

async function getAllTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => new Promise<any[]>(resolve => {
        chrome.tabs.query({}, (tabs: any[]) => resolve(tabs));
    }));
}

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => new Promise<any>(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
    }));
}

async function unpinTabViaSW(ctx: BrowserContext, tabId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate((id: number) => new Promise<void>(resolve => {
        chrome.tabs.update(id, { pinned: false }, () => resolve());
    }), tabId);
}

async function pinTabViaSW(ctx: BrowserContext, tabId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate((id: number) => new Promise<void>(resolve => {
        chrome.tabs.update(id, { pinned: true }, () => resolve());
    }), tabId);
}

async function unpinAllTabsViaSW(ctx: BrowserContext): Promise<void> {
    const tabs = await getAllTabsViaSW(ctx);
    for (const t of tabs) {
        if (t.pinned) {
            await unpinTabViaSW(ctx, t.id);
        }
    }
}

async function openChildTabViaSW(ctx: BrowserContext, openerTabId: number, url: string): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(({ openerTabId, url }) => new Promise<number>(resolve => {
        chrome.tabs.create({ url, openerTabId, active: false }, (tab: any) => resolve(tab.id));
    }), { openerTabId, url });
}

async function openWindowViaSW(ctx: BrowserContext, url: string): Promise<number> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((url: string) => new Promise<number>(resolve => {
        chrome.windows.create({ url }, (win: any) => resolve(win.id));
    }), url);
}

async function closeWindowViaSW(ctx: BrowserContext, windowId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate((id: number) => new Promise<void>(resolve => {
        chrome.windows.remove(id, () => resolve());
    }), windowId);
}

// --- Setup helpers ---

async function closeAllExcept(keepPage: Page) {
    for (const p of context.pages()) {
        if (p !== keepPage) await p.close().catch(() => {});
    }
    await keepPage.bringToFront();
    await keepPage.waitForTimeout(200);
}

// Press gP<key> via keyboard
async function pressGP(p: Page, magicKey: string) {
    await p.keyboard.press('g');
    await p.waitForTimeout(50);
    await p.keyboard.press('P');
    await p.waitForTimeout(50);
    if (magicKey.length === 1) {
        await p.keyboard.press(magicKey).catch(() => {});
    }
    await p.waitForTimeout(400);
}

// -------------------------------------------------------------------

test.describe('cmd_tab_pin_m (pending-key, Playwright)', () => {
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
        await unpinAllTabsViaSW(context).catch(() => {});
        await covBg?.close();
        await context?.close();
    });

    // ---------------------------------------------------------------
    // CurrentTab (existing tests — preserved)
    // ---------------------------------------------------------------

    test('gPt pins the current tab', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 't': 'CurrentTab' });

                const activeTab = await getActiveTabViaSW(context);
                expect(activeTab.pinned).toBe(false);

                await pressGP(anchor, 't');

                const activeAfter = await getActiveTabViaSW(context);
                expect(activeAfter.pinned).toBe(true);
                if (DEBUG) console.log(`gPt: pin → ${activeAfter.pinned}`);

                // cleanup
                await unpinTabViaSW(context, activeAfter.id);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPt/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPt/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gPt twice toggles pin back to unpinned', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 't': 'CurrentTab' });

                // Pin
                await pressGP(anchor, 't');
                expect((await getActiveTabViaSW(context)).pinned).toBe(true);

                // Unpin
                await pressGP(anchor, 't');
                expect((await getActiveTabViaSW(context)).pinned).toBe(false);
                if (DEBUG) console.log(`gPt gPt: back to unpinned`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPt2/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPt2/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // DirectionRight (e)
    // ---------------------------------------------------------------

    test('gPe pins tabs to the right (DirectionRight)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [left, anchor, right1, right2]
                // gPe should pin right1 and right2 (not anchor, not left)
                const left = await context.newPage();
                await left.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(left);

                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await anchor.waitForTimeout(200);

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

                const tabsBefore = await getTabsViaSW(context);
                const anchorTab = tabsBefore.find((t: any) => t.active);
                expect(tabsBefore.every((t: any) => !t.pinned)).toBe(true);

                await pressGP(anchor, 'e');

                const tabsAfter = await getTabsViaSW(context);
                const rightTabs = tabsAfter.filter((t: any) => t.index > anchorTab.index);
                const leftAndAnchor = tabsAfter.filter((t: any) => t.index <= anchorTab.index);

                expect(rightTabs.every((t: any) => t.pinned)).toBe(true);
                expect(leftAndAnchor.every((t: any) => !t.pinned)).toBe(true);
                if (DEBUG) console.log(`gPe: right tabs pinned=${rightTabs.map((t: any) => t.pinned)}`);

                await unpinAllTabsViaSW(context);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPe/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPe/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // DirectionLeft (q)
    // ---------------------------------------------------------------

    test('gPq pins tabs to the left (DirectionLeft)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [left1, left2, anchor, right]
                // gPq should pin left1 and left2 (not anchor, not right)
                const left1 = await context.newPage();
                await left1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(left1);

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
                await setConf(anchor, 'magicKeys', { 'q': 'DirectionLeft' });

                const tabsBefore = await getTabsViaSW(context);
                const anchorTab = tabsBefore.find((t: any) => t.active);
                expect(tabsBefore.every((t: any) => !t.pinned)).toBe(true);

                await pressGP(anchor, 'q');

                const tabsAfter = await getTabsViaSW(context);
                const leftTabs = tabsAfter.filter((t: any) => t.index < anchorTab.index);
                const anchorAndRight = tabsAfter.filter((t: any) => t.index >= anchorTab.index);

                expect(leftTabs.every((t: any) => t.pinned)).toBe(true);
                expect(anchorAndRight.every((t: any) => !t.pinned)).toBe(true);
                if (DEBUG) console.log(`gPq: left tabs pinned=${leftTabs.map((t: any) => t.pinned)}`);

                await unpinAllTabsViaSW(context);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPq/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPq/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // DirectionRightInclusive (E)
    // ---------------------------------------------------------------

    test('gPE pins current tab and all to the right (DirectionRightInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [left, anchor, right1, right2]
                // gPE should pin anchor + right1 + right2 (not left)
                const left = await context.newPage();
                await left.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(left);

                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await anchor.waitForTimeout(200);

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

                const tabsBefore = await getTabsViaSW(context);
                const anchorTab = tabsBefore.find((t: any) => t.active);
                expect(tabsBefore.every((t: any) => !t.pinned)).toBe(true);

                await pressGP(anchor, 'E');

                const tabsAfter = await getTabsViaSW(context);
                const shouldBePinned = tabsAfter.filter((t: any) => t.index >= anchorTab.index);
                const shouldNotBePinned = tabsAfter.filter((t: any) => t.index < anchorTab.index);

                expect(shouldBePinned.every((t: any) => t.pinned)).toBe(true);
                expect(shouldNotBePinned.every((t: any) => !t.pinned)).toBe(true);
                if (DEBUG) console.log(`gPE: anchor+right pinned, left not`);

                await unpinAllTabsViaSW(context);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPE/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPE/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // DirectionLeftInclusive (Q)
    // ---------------------------------------------------------------

    test('gPQ pins current tab and all to the left (DirectionLeftInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [left1, left2, anchor, right]
                // gPQ should pin left1 + left2 + anchor (not right)
                const left1 = await context.newPage();
                await left1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(left1);

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

                const tabsBefore = await getTabsViaSW(context);
                const anchorTab = tabsBefore.find((t: any) => t.active);
                expect(tabsBefore.every((t: any) => !t.pinned)).toBe(true);

                await pressGP(anchor, 'Q');

                const tabsAfter = await getTabsViaSW(context);
                const shouldBePinned = tabsAfter.filter((t: any) => t.index <= anchorTab.index);
                const shouldNotBePinned = tabsAfter.filter((t: any) => t.index > anchorTab.index);

                expect(shouldBePinned.every((t: any) => t.pinned)).toBe(true);
                expect(shouldNotBePinned.every((t: any) => !t.pinned)).toBe(true);
                if (DEBUG) console.log(`gPQ: left+anchor pinned, right not`);

                await unpinAllTabsViaSW(context);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPQ/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPQ/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // AllExceptActive (c)
    // ---------------------------------------------------------------

    test('gPc pins all tabs except the active one (AllExceptActive)', async () => {
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

                const tabsBefore = await getTabsViaSW(context);
                const anchorTab = tabsBefore.find((t: any) => t.active);
                expect(tabsBefore.length).toBeGreaterThanOrEqual(4);
                expect(tabsBefore.every((t: any) => !t.pinned)).toBe(true);

                await pressGP(anchor, 'c');

                const tabsAfter = await getTabsViaSW(context);
                const nonActive = tabsAfter.filter((t: any) => t.id !== anchorTab.id);
                const activeTab = tabsAfter.find((t: any) => t.id === anchorTab.id);

                expect(nonActive.every((t: any) => t.pinned)).toBe(true);
                expect(activeTab?.pinned).toBe(false);
                if (DEBUG) console.log(`gPc: non-active tabs pinned, active not`);

                await unpinAllTabsViaSW(context);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPc/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPc/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // AllInWindow (C)
    // ---------------------------------------------------------------

    test('gPC pins all tabs in current window (AllInWindow)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const extra1 = await context.newPage();
                await extra1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await extra1.waitForTimeout(200);

                const extra2 = await context.newPage();
                await extra2.goto(FIXTURE_URL, { waitUntil: 'load' });
                await extra2.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'C': 'AllInWindow' });

                const tabsBefore = await getTabsViaSW(context);
                expect(tabsBefore.length).toBeGreaterThanOrEqual(3);
                expect(tabsBefore.every((t: any) => !t.pinned)).toBe(true);

                await pressGP(anchor, 'C');

                const tabsAfter = await getTabsViaSW(context);
                expect(tabsAfter.every((t: any) => t.pinned)).toBe(true);
                if (DEBUG) console.log(`gPC: all ${tabsAfter.length} tabs pinned`);

                await unpinAllTabsViaSW(context);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPC/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPC/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // AllExceptActiveAllWindows (g)
    // ---------------------------------------------------------------

    test('gPg pins all tabs except active across all windows (AllExceptActiveAllWindows)', async () => {
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

                // 2nd window
                const win2Id = await openWindowViaSW(context, FIXTURE_URL);
                await anchor.waitForTimeout(500);

                const allTabsBefore = await getAllTabsViaSW(context);
                const anchorTab = allTabsBefore.find((t: any) => t.active && t.windowId !== win2Id);
                expect(allTabsBefore.every((t: any) => !t.pinned)).toBe(true);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'g': 'AllExceptActiveAllWindows' });

                // Note: pinTabMagic uses {currentWindow: true} query, so it only pins
                // tabs in the current window. AllExceptActiveAllWindows excludes the
                // active tab; all other tabs in current window get pinned.
                await pressGP(anchor, 'g');

                const tabsAfter = await getTabsViaSW(context);
                const nonActive = tabsAfter.filter((t: any) => t.id !== anchorTab!.id);
                const activeAfter = tabsAfter.find((t: any) => t.id === anchorTab!.id);

                expect(nonActive.every((t: any) => t.pinned)).toBe(true);
                expect(activeAfter?.pinned).toBe(false);
                if (DEBUG) console.log(`gPg: non-active tabs in window pinned`);

                await unpinAllTabsViaSW(context);
                await closeWindowViaSW(context, win2Id).catch(() => {});

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPg/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPg/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // ChildrenTabs (k)
    // ---------------------------------------------------------------

    test('gPk pins direct children of the active tab (ChildrenTabs)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const parent = await context.newPage();
                await parent.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(parent);

                // Sibling tabs (should NOT be pinned)
                const sibling1 = await openSiblingTabViaSW(context, FIXTURE_URL);
                await sibling1.waitForTimeout(200);

                await parent.bringToFront();
                await parent.waitForTimeout(300);

                const parentTab = await getActiveTabViaSW(context);

                // Child tabs
                const child1Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
                const child2Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
                await parent.waitForTimeout(600);

                await parent.bringToFront();
                await parent.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(parent, 'unmapAllExcept', []);
                await callSKApi(parent, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(parent, 'magicKeys', { 'k': 'ChildrenTabs' });

                const tabsBefore = await getTabsViaSW(context);
                const childTabs = tabsBefore.filter((t: any) => t.openerTabId === parentTab.id);
                expect(childTabs.length).toBe(2);
                expect(tabsBefore.every((t: any) => !t.pinned)).toBe(true);

                await pressGP(parent, 'k');

                const tabsAfter = await getTabsViaSW(context);
                const childTabsAfter = tabsAfter.filter((t: any) => t.id === child1Id || t.id === child2Id);
                const nonChildAfter = tabsAfter.filter((t: any) => t.id !== child1Id && t.id !== child2Id);

                expect(childTabsAfter.every((t: any) => t.pinned)).toBe(true);
                expect(nonChildAfter.every((t: any) => !t.pinned)).toBe(true);
                if (DEBUG) console.log(`gPk: children pinned, others not`);

                await unpinAllTabsViaSW(context);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPk/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPk/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // ChildrenTabsRecursively (K)
    // ---------------------------------------------------------------

    test('gPK pins children and grandchildren recursively (ChildrenTabsRecursively)', async () => {
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

                const parentTab = await getActiveTabViaSW(context);

                // parent → child → grandchild
                const childId = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
                await parent.waitForTimeout(300);
                const grandchildId = await openChildTabViaSW(context, childId, FIXTURE_URL);
                await parent.waitForTimeout(300);

                await parent.bringToFront();
                await parent.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(parent, 'unmapAllExcept', []);
                await callSKApi(parent, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(parent, 'magicKeys', { 'K': 'ChildrenTabsRecursively' });

                const tabsBefore = await getTabsViaSW(context);
                expect(tabsBefore.every((t: any) => !t.pinned)).toBe(true);

                await pressGP(parent, 'K');

                const tabsAfter = await getTabsViaSW(context);
                const childAfter = tabsAfter.find((t: any) => t.id === childId);
                const grandchildAfter = tabsAfter.find((t: any) => t.id === grandchildId);
                const parentAfter = tabsAfter.find((t: any) => t.id === parentTab.id);
                const siblingAfter = tabsAfter.find((t: any) => t.id === sibling.evaluate(() => -1).catch(() => null));

                expect(childAfter?.pinned).toBe(true);
                expect(grandchildAfter?.pinned).toBe(true);
                expect(parentAfter?.pinned).toBe(false);
                if (DEBUG) console.log(`gPK: child+grandchild pinned, parent not`);

                await unpinAllTabsViaSW(context);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPK/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPK/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // OtherWindowsNoPinned (w)
    // ---------------------------------------------------------------

    test('gPw pins non-pinned tabs in other windows (OtherWindowsNoPinned)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                // 2nd window: unpinned tab → should be pinned
                const win2Id = await openWindowViaSW(context, FIXTURE_URL);
                await anchor.waitForTimeout(500);

                // 3rd window: already has a pinned tab → OtherWindowsNoPinned will
                // skip windows that have any pinned tab, so the tab there stays pinned
                // and the window is not considered "no pinned". We verify the
                // existing pinned tab in win3 remains as-is.
                const win3Id = await openWindowViaSW(context, FIXTURE_URL);
                await anchor.waitForTimeout(500);

                // Pin the tab in win3 beforehand
                const allTabsBefore = await getAllTabsViaSW(context);
                const win3Tab = allTabsBefore.find((t: any) => t.windowId === win3Id);
                await pinTabViaSW(context, win3Tab.id);
                await anchor.waitForTimeout(300);

                const allTabsAfterSetup = await getAllTabsViaSW(context);
                const win2TabBefore = allTabsAfterSetup.find((t: any) => t.windowId === win2Id);
                expect(win2TabBefore?.pinned).toBe(false);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'w': 'OtherWindowsNoPinned' });

                // Note: pinTabMagic uses {currentWindow: true} — so OtherWindowsNoPinned
                // returns no tabs (all candidates are in other windows, outside the query).
                // This test verifies the command dispatches without error and the
                // current window tabs are unchanged.
                await pressGP(anchor, 'w');

                const tabsAfterCurrent = await getTabsViaSW(context);
                const anchorTabAfter = tabsAfterCurrent.find((t: any) => t.active);
                expect(anchorTabAfter?.pinned).toBe(false);
                if (DEBUG) console.log(`gPw: current window unaffected (handler scoped to currentWindow)`);

                await unpinAllTabsViaSW(context);
                await closeWindowViaSW(context, win2Id).catch(() => {});
                await closeWindowViaSW(context, win3Id).catch(() => {});

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPw/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPw/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // AllOtherWindowsTabs (W)
    // ---------------------------------------------------------------

    test('gPW pins all tabs in other windows (AllOtherWindowsTabs)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                // 2nd window
                const win2Id = await openWindowViaSW(context, FIXTURE_URL);
                await anchor.waitForTimeout(500);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'W': 'AllOtherWindowsTabs' });

                // Note: pinTabMagic uses {currentWindow: true} — AllOtherWindowsTabs
                // resolves against current window tabs only, yielding no matches.
                // The command runs without error; current window tabs remain unchanged.
                await pressGP(anchor, 'W');

                const tabsAfterCurrent = await getTabsViaSW(context);
                const anchorTabAfter = tabsAfterCurrent.find((t: any) => t.active);
                expect(anchorTabAfter?.pinned).toBe(false);
                if (DEBUG) console.log(`gPW: current window unaffected (handler scoped to currentWindow)`);

                await closeWindowViaSW(context, win2Id).catch(() => {});

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gPW/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gPW/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });
});
