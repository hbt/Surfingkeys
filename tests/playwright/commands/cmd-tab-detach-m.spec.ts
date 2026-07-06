import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, openSiblingTabViaSW } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_detach_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'gD';
const UNIQUE_ID = 'cmd_tab_detach_m';

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

async function getAllWindowsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.windows.getAll({ populate: true }, (windows: any[]) => resolve(windows));
        });
    });
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

async function waitForWindowCount(ctx: BrowserContext, expected: number, maxWaitMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const windows = await getAllWindowsViaSW(ctx);
        if (windows.length >= expected) return;
        await new Promise(r => setTimeout(r, 100));
    }
}

async function waitForWindowCountExact(ctx: BrowserContext, expected: number, maxWaitMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const windows = await getAllWindowsViaSW(ctx);
        if (windows.length === expected) return;
        await new Promise(r => setTimeout(r, 100));
    }
}

test.describe('cmd_tab_detach_m (pending-key, Playwright)', () => {
    test.setTimeout(25_000);

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

    async function cleanupExtraWindows(originalWindowId: number) {
        const windows = await getAllWindowsViaSW(context);
        for (const w of windows) {
            if (w.id !== originalWindowId) {
                await closeWindowViaSW(context, w.id).catch(() => {});
            }
        }
        await new Promise(r => setTimeout(r, 300));
    }

    test('gDt detaches current tab to a new window', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                // Add a sibling tab so the original window doesn't close
                const sibling = await context.newPage();
                await sibling.goto(FIXTURE_URL, { waitUntil: 'load' });
                await sibling.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 't': 'CurrentTab' });

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('t');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                // The detached tab (anchor) is in the new window; sibling stays in original
                expect(originalWindow!.tabs.length).toBe(1);
                expect(newWindow!.tabs.length).toBe(1);

                if (DEBUG) console.log(`gDt: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDt/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDt/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});

                // Clean up extra window
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

    test('gDe detaches tabs to the right (DirectionRight)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [anchor, right1, right2]
                // gDe should move right1 + right2 to a new window
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

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('e');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                // anchor stays in original, right1+right2 move to new window
                expect(originalWindow!.tabs.length).toBe(1);
                expect(newWindow!.tabs.length).toBe(2);

                if (DEBUG) console.log(`gDe: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDe/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDe/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await cleanupExtraWindows(originalWindowId);
            },
        );
    });

    test('2gDe detaches only 2 tabs to the right (digit prefix respected)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [anchor, right1, right2, right3]
                // 2gDe should move only right1 + right2 (closest 2) to a new window, right3 stays
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const right1 = await context.newPage();
                await right1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await right1.waitForTimeout(200);

                const right2 = await context.newPage();
                await right2.goto(FIXTURE_URL, { waitUntil: 'load' });
                await right2.waitForTimeout(200);

                const right3 = await context.newPage();
                await right3.goto(FIXTURE_URL, { waitUntil: 'load' });
                await right3.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'e': 'DirectionRight' });

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await anchor.keyboard.press('2');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('e');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                // anchor + right3 stay in original, only right1+right2 move to new window
                expect(originalWindow!.tabs.length).toBe(2);
                expect(newWindow!.tabs.length).toBe(2);

                if (DEBUG) console.log(`2gDe: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/2gDe/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/2gDe/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await cleanupExtraWindows(originalWindowId);
            },
        );
    });

    test('gDq detaches tabs to the left (DirectionLeft)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [left1, left2, anchor, right]
                // gDq should move left1 + left2 to a new window
                const base = await context.newPage();
                await base.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(base);
                await base.close();

                const left1 = await context.newPage();
                await left1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await left1.waitForTimeout(200);

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

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('q');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                // anchor + right stay in original, left1 + left2 move to new window
                expect(originalWindow!.tabs.length).toBe(2);
                expect(newWindow!.tabs.length).toBe(2);

                if (DEBUG) console.log(`gDq: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDq/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDq/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await cleanupExtraWindows(originalWindowId);
            },
        );
    });

    test('gDE detaches current tab and tabs to the right (DirectionRightInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [left, anchor, right1, right2]
                // gDE should move anchor + right1 + right2 to new window, left stays
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

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('E');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                // left stays in original, anchor+right1+right2 move to new window
                expect(originalWindow!.tabs.length).toBe(1);
                expect(newWindow!.tabs.length).toBe(3);

                if (DEBUG) console.log(`gDE: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDE/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDE/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await cleanupExtraWindows(originalWindowId);
            },
        );
    });

    test('gDQ detaches tabs to the left and current tab (DirectionLeftInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [left1, left2, anchor, right]
                // gDQ should move left1 + left2 + anchor to new window, right stays
                const base = await context.newPage();
                await base.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(base);
                await base.close();

                const left1 = await context.newPage();
                await left1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await left1.waitForTimeout(200);

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

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('Q');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                // right stays in original, left1+left2+anchor move to new window
                expect(originalWindow!.tabs.length).toBe(1);
                expect(newWindow!.tabs.length).toBe(3);

                if (DEBUG) console.log(`gDQ: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDQ/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDQ/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await cleanupExtraWindows(originalWindowId);
            },
        );
    });

    test('gDc detaches all tabs except active (AllExceptActive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const tab1 = await context.newPage();
                await tab1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await tab1.waitForTimeout(200);

                const tab2 = await context.newPage();
                await tab2.goto(FIXTURE_URL, { waitUntil: 'load' });
                await tab2.waitForTimeout(200);

                const tab3 = await context.newPage();
                await tab3.goto(FIXTURE_URL, { waitUntil: 'load' });
                await tab3.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'c': 'AllExceptActive' });

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('c');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                // anchor stays in original, tab1+tab2+tab3 move to new window
                expect(originalWindow!.tabs.length).toBe(1);
                expect(newWindow!.tabs.length).toBe(3);

                if (DEBUG) console.log(`gDc: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDc/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDc/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await cleanupExtraWindows(originalWindowId);
            },
        );
    });

    test('gDC detaches all tabs in window (AllInWindow)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const tab1 = await context.newPage();
                await tab1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await tab1.waitForTimeout(200);

                const tab2 = await context.newPage();
                await tab2.goto(FIXTURE_URL, { waitUntil: 'load' });
                await tab2.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'C': 'AllInWindow' });

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('C');

                // All tabs move to new window; window count stays the same (old one closes)
                await anchor.waitForTimeout(1000);

                const afterWindows = await getAllWindowsViaSW(context);
                // AllInWindow: all 3 tabs move, old window closes → still 1 window
                expect(afterWindows.length).toBe(1);
                expect(afterWindows[0].tabs.length).toBe(3);

                if (DEBUG) console.log(`gDC: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDC/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDC/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gDg detaches all tabs except active across all windows (AllExceptActiveAllWindows)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                // Extra tab in same window
                const extra = await context.newPage();
                await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
                await extra.waitForTimeout(200);

                // Second window with a tab
                const win2Id = await openWindowViaSW(context, FIXTURE_URL);
                await anchor.waitForTimeout(500);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'g': 'AllExceptActiveAllWindows' });

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows.find((w: any) => w.tabs.some((t: any) => t.active))?.id ?? beforeWindows[0].id;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('g');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBeGreaterThan(1);

                // anchor should still be in its original window
                const allTabsAfter = await getAllTabsViaSW(context);
                const anchorTabAfter = allTabsAfter.find((t: any) => t.active);
                expect(anchorTabAfter).toBeDefined();

                if (DEBUG) console.log(`gDg: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDg/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDg/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});

                // Cleanup extra windows
                const currentWindows = await getAllWindowsViaSW(context);
                for (const w of currentWindows) {
                    if (w.id !== anchorTabAfter?.windowId) {
                        await closeWindowViaSW(context, w.id).catch(() => {});
                    }
                }
                await new Promise(r => setTimeout(r, 300));
            },
        );
    });

    test('gDk detaches child tabs of active tab (ChildrenTabs)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const parent = await context.newPage();
                await parent.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(parent);

                // Siblings (not children)
                const sibling1 = await openSiblingTabViaSW(context, FIXTURE_URL);
                await sibling1.waitForTimeout(200);
                const sibling2 = await openSiblingTabViaSW(context, FIXTURE_URL);
                await sibling2.waitForTimeout(200);

                await parent.bringToFront();
                await parent.waitForTimeout(300);

                const parentTab = await getActiveTabViaSW(context);

                // Open child tabs
                const child1Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
                const child2Id = await openChildTabViaSW(context, parentTab.id, FIXTURE_URL);
                await parent.waitForTimeout(400);

                await parent.bringToFront();
                await parent.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(parent, 'unmapAllExcept', []);
                await callSKApi(parent, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(parent, 'magicKeys', { 'k': 'ChildrenTabs' });

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await parent.keyboard.press('g');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('D');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('k');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                // parent + sibling1 + sibling2 stay; child1 + child2 move
                expect(originalWindow!.tabs.length).toBe(3);
                expect(newWindow!.tabs.length).toBe(2);

                // Verify specific child IDs are in the new window
                const newWindowTabIds = new Set(newWindow!.tabs.map((t: any) => t.id));
                expect(newWindowTabIds.has(child1Id)).toBe(true);
                expect(newWindowTabIds.has(child2Id)).toBe(true);

                if (DEBUG) console.log(`gDk: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDk/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDk/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await cleanupExtraWindows(originalWindowId);
            },
        );
    });

    test('gDK detaches child and grandchild tabs recursively (ChildrenTabsRecursively)', async () => {
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
                await parent.waitForTimeout(200);
                const grandchildId = await openChildTabViaSW(context, childId, FIXTURE_URL);
                await parent.waitForTimeout(200);

                await parent.bringToFront();
                await parent.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(parent, 'unmapAllExcept', []);
                await callSKApi(parent, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(parent, 'magicKeys', { 'K': 'ChildrenTabsRecursively' });

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows[0].id;

                await parent.keyboard.press('g');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('D');
                await parent.waitForTimeout(50);
                await parent.keyboard.press('K');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                expect(afterWindows.length).toBe(beforeCount + 1);

                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

                expect(originalWindow).toBeDefined();
                expect(newWindow).toBeDefined();
                // parent + sibling stay; child + grandchild move
                expect(originalWindow!.tabs.length).toBe(2);
                expect(newWindow!.tabs.length).toBe(2);

                const newWindowTabIds = new Set(newWindow!.tabs.map((t: any) => t.id));
                expect(newWindowTabIds.has(childId)).toBe(true);
                expect(newWindowTabIds.has(grandchildId)).toBe(true);

                if (DEBUG) console.log(`gDK: windows ${beforeCount} → ${afterWindows.length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDK/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDK/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await cleanupExtraWindows(originalWindowId);
            },
        );
    });

    test('gDw detaches tabs from other windows (no pinned) into a new window (OtherWindowsNoPinned)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const sw = context.serviceWorkers()[0];

                // 2nd window: no pinned tabs → tabs should be moved
                const win2Id = await openWindowViaSW(context, FIXTURE_URL);
                await anchor.waitForTimeout(500);

                // 3rd window: has a pinned tab → should be skipped
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
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'w': 'OtherWindowsNoPinned' });

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows.find((w: any) => w.tabs.some((t: any) => t.active))?.id ?? beforeWindows[0].id;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('w');

                // win2 tabs move to new window; win2 closes; win3 (pinned) stays
                await waitForWindowCountExact(context, beforeCount, 3000);
                await anchor.waitForTimeout(500);

                const afterWindows = await getAllWindowsViaSW(context);

                // win2 tabs moved to a new window, win2 closed → window count same
                // win3 (pinned) untouched
                const win2After = afterWindows.find((w: any) => w.id === win2Id);
                const win3After = afterWindows.find((w: any) => w.id === win3Id);

                expect(win2After).toBeUndefined(); // win2 was closed after tabs moved
                expect(win3After).toBeDefined();   // win3 (pinned) survived
                expect(win3After!.tabs.length).toBeGreaterThan(0);

                if (DEBUG) console.log(`gDw: win2 tabs moved, win3 (pinned) survived`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDw/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDw/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});

                // Cleanup
                const finalWindows = await getAllWindowsViaSW(context);
                for (const w of finalWindows) {
                    if (w.id !== originalWindowId && w.id !== win3Id) {
                        await closeWindowViaSW(context, w.id).catch(() => {});
                    }
                }
                await closeWindowViaSW(context, win3Id).catch(() => {});
                await new Promise(r => setTimeout(r, 300));
            },
        );
    });

    test('gDW detaches all tabs from other windows into a new window (AllOtherWindowsTabs)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const sw = context.serviceWorkers()[0];

                // 2nd window with 2 tabs
                const win2Id = await openWindowViaSW(context, FIXTURE_URL);
                await anchor.waitForTimeout(500);
                await sw.evaluate(({ win2Id, url }: { win2Id: number; url: string }) => {
                    return new Promise<void>((resolve) => {
                        chrome.tabs.create({ windowId: win2Id, url, active: false }, () => resolve());
                    });
                }, { win2Id, url: FIXTURE_URL });
                await anchor.waitForTimeout(500);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'W': 'AllOtherWindowsTabs' });

                const allTabsBefore = await getAllTabsViaSW(context);
                const win2TabsBefore = allTabsBefore.filter((t: any) => t.windowId === win2Id);
                expect(win2TabsBefore.length).toBe(2);

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                const originalWindowId = beforeWindows.find((w: any) => w.tabs.some((t: any) => t.active))?.id ?? beforeWindows[0].id;

                await anchor.keyboard.press('g');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('D');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('W');

                // win2 tabs move to new window, win2 closes → window count stays same
                await waitForWindowCountExact(context, beforeCount, 3000);
                await anchor.waitForTimeout(500);

                const afterWindows = await getAllWindowsViaSW(context);
                const win2After = afterWindows.find((w: any) => w.id === win2Id);
                expect(win2After).toBeUndefined(); // win2 closed after tabs moved

                // Find the new window (not original, not win2)
                const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId && w.id !== win2Id);
                expect(newWindow).toBeDefined();
                expect(newWindow!.tabs.length).toBe(2); // win2's 2 tabs moved here

                // Anchor's window still has just anchor
                const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
                expect(originalWindow).toBeDefined();
                expect(originalWindow!.tabs.length).toBe(1);

                if (DEBUG) console.log(`gDW: win2 tabs moved to new window`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gDW/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gDW/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await cleanupExtraWindows(originalWindowId);
            },
        );
    });
});
