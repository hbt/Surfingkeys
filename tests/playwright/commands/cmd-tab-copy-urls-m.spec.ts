import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, openSiblingTabViaSW } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_copy_urls_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'gY';
const UNIQUE_ID = 'cmd_tab_copy_urls_m';

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

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

async function getClipboardText(p: Page): Promise<string> {
    return p.evaluate(() => navigator.clipboard.readText());
}

// SW helpers

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

// Press a 3-key chord: g Y <magicKey>
async function pressChord(p: Page, magicKey: string) {
    await p.keyboard.press('g');
    await p.waitForTimeout(50);
    await p.keyboard.press('Y');
    await p.waitForTimeout(50);
    await p.keyboard.press(magicKey);
    await p.waitForTimeout(500);
}

// Close all pages except keepPage
async function closeAllExcept(keepPage: Page) {
    for (const p of context.pages()) {
        if (p !== keepPage) await p.close().catch(() => {});
    }
    await keepPage.bringToFront();
    await keepPage.waitForTimeout(200);
}

test.describe('cmd_tab_copy_urls_m (pending-key, Playwright)', () => {
    test.setTimeout(30_000);

    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
        await setConf(page, 'magicKeys', { 't': 'CurrentTab', 'C': 'AllInWindow' });
    });

    // ─── gYt ─────────────────────────────────────────────────────────────────

    test('gYt copies current tab URL to clipboard', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await page.bringToFront();
                await page.waitForTimeout(200);

                await pressChord(page, 't');

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('scroll-test.html');
                if (DEBUG) console.log(`gYt: clipboard=${clip}`);
            },
        );
    });

    // ─── gYC (AllInWindow) ────────────────────────────────────────────────────

    test('gYC copies all tab URLs in window to clipboard (AllInWindow)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);

                // Open an additional tab so we have at least 2
                const extra = await context.newPage();
                await extra.goto(`${FIXTURE_URL}#extra_C`, { waitUntil: 'load' });
                await extra.waitForTimeout(200);

                await page.bringToFront();
                await page.waitForTimeout(300);

                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'C': 'AllInWindow' });

                await pressChord(page, 'C');

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('scroll-test.html');
                // AllInWindow should include both tabs
                expect(clip.split('\n').length).toBeGreaterThanOrEqual(2);
                if (DEBUG) console.log(`gYC: clipboard lines=${clip.split('\n').length}`);

                await extra.close().catch(() => {});
            },
        );
    });

    // ─── gYa (legacy alias for AllInWindow, keep for backward compat) ─────────

    test('gYa copies all tab URLs in window to clipboard (AllInWindow legacy key)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);

                // Open an additional tab so we have at least 2
                const extra = await context.newPage();
                await extra.goto(`${FIXTURE_URL}#extra`, { waitUntil: 'load' });
                await extra.waitForTimeout(200);

                await page.bringToFront();
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'a': 'AllInWindow' });

                await pressChord(page, 'a');

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('scroll-test.html');
                // AllInWindow should include both tabs
                expect(clip.split('\n').length).toBeGreaterThanOrEqual(2);
                if (DEBUG) console.log(`gYa: clipboard lines=${clip.split('\n').length}`);                await extra.close().catch(() => {});
            },
        );
    });

    // ─── gYe (DirectionRight) ─────────────────────────────────────────────────

    test('gYe copies URLs of tabs to the right (DirectionRight)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);
                await page.waitForTimeout(100);

                const right1 = await context.newPage();
                await right1.goto(`${FIXTURE_URL}#right1_e`, { waitUntil: 'load' });
                await right1.waitForTimeout(200);
                const right2 = await context.newPage();
                await right2.goto(`${FIXTURE_URL}#right2_e`, { waitUntil: 'load' });
                await right2.waitForTimeout(200);

                await page.bringToFront();
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'e': 'DirectionRight' });

                await pressChord(page, 'e');

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('right1_e');
                expect(clip).toContain('right2_e');
                // Active tab URL should NOT be in clipboard (DirectionRight = tabs to the right only)
                expect(clip).not.toContain('cov_content_anchor');
                const lines = clip.split('\n').filter(Boolean);
                expect(lines.length).toBe(2);
                if (DEBUG) console.log(`gYe: clipboard=${clip}`);                await right1.close().catch(() => {});
                await right2.close().catch(() => {});
            },
        );
    });

    // ─── gYq (DirectionLeft) ─────────────────────────────────────────────────

    test('gYq copies URLs of tabs to the left (DirectionLeft)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                // Setup: [left1, left2, anchor] — need anchor to be rightmost tab.
                // Close all pages in context, then open left1, left2, anchor in that order.
                for (const p of context.pages()) {
                    await p.close().catch(() => {});
                }
                await new Promise(r => setTimeout(r, 200));

                const left1 = await context.newPage();
                await left1.goto(`${FIXTURE_URL}#left1_q`, { waitUntil: 'load' });
                await left1.waitForTimeout(200);
                const left2 = await context.newPage();
                await left2.goto(`${FIXTURE_URL}#left2_q`, { waitUntil: 'load' });
                await left2.waitForTimeout(200);

                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await anchor.waitForTimeout(300);
                // Update module-level page so beforeEach remains valid for subsequent tests
                page = anchor;

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'q': 'DirectionLeft' });

                await pressChord(anchor, 'q');

                const clip = await getClipboardText(anchor).catch(() => '');
                expect(clip).toContain('left1_q');
                expect(clip).toContain('left2_q');
                // Active tab should NOT be in clipboard
                expect(clip).not.toContain('cov_content_anchor');
                const lines = clip.split('\n').filter(Boolean);
                expect(lines.length).toBe(2);
                if (DEBUG) console.log(`gYq: clipboard=${clip}`);                await left1.close().catch(() => {});
                await left2.close().catch(() => {});
            },
        );
    });

    // ─── gYE (DirectionRightInclusive) ────────────────────────────────────────

    test('gYE copies current tab + tabs to the right (DirectionRightInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);
                await page.waitForTimeout(100);

                const right1 = await context.newPage();
                await right1.goto(`${FIXTURE_URL}#right1_E`, { waitUntil: 'load' });
                await right1.waitForTimeout(200);
                const right2 = await context.newPage();
                await right2.goto(`${FIXTURE_URL}#right2_E`, { waitUntil: 'load' });
                await right2.waitForTimeout(200);

                await page.bringToFront();
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'E': 'DirectionRightInclusive' });

                await pressChord(page, 'E');

                const clip = await getClipboardText(page).catch(() => '');
                // Should include active tab + tabs to the right (3 total)
                expect(clip).toContain('scroll-test.html');
                expect(clip).toContain('right1_E');
                expect(clip).toContain('right2_E');
                const lines = clip.split('\n').filter(Boolean);
                expect(lines.length).toBe(3);
                if (DEBUG) console.log(`gYE: clipboard lines=${lines.length}`);                await right1.close().catch(() => {});
                await right2.close().catch(() => {});
            },
        );
    });

    // ─── gYQ (DirectionLeftInclusive) ─────────────────────────────────────────

    test('gYQ copies current tab + tabs to the left (DirectionLeftInclusive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                // Setup: [left1, left2, anchor] — anchor must be rightmost.
                for (const p of context.pages()) {
                    await p.close().catch(() => {});
                }
                await new Promise(r => setTimeout(r, 200));

                const left1 = await context.newPage();
                await left1.goto(`${FIXTURE_URL}#left1_Q`, { waitUntil: 'load' });
                await left1.waitForTimeout(200);
                const left2 = await context.newPage();
                await left2.goto(`${FIXTURE_URL}#left2_Q`, { waitUntil: 'load' });
                await left2.waitForTimeout(200);

                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await anchor.waitForTimeout(300);
                page = anchor;

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'Q': 'DirectionLeftInclusive' });

                await pressChord(anchor, 'Q');

                const clip = await getClipboardText(anchor).catch(() => '');
                // Should include active tab + tabs to the left (3 total)
                expect(clip).toContain('left1_Q');
                expect(clip).toContain('left2_Q');
                expect(clip).toContain('scroll-test.html');
                const lines = clip.split('\n').filter(Boolean);
                expect(lines.length).toBe(3);
                if (DEBUG) console.log(`gYQ: clipboard lines=${lines.length}`);                await left1.close().catch(() => {});
                await left2.close().catch(() => {});
            },
        );
    });

    // ─── gYc (AllExceptActive) ────────────────────────────────────────────────

    test('gYc copies all tab URLs except active (AllExceptActive)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);
                await page.waitForTimeout(100);

                const extra1 = await context.newPage();
                await extra1.goto(`${FIXTURE_URL}#extra1_c`, { waitUntil: 'load' });
                await extra1.waitForTimeout(200);
                const extra2 = await context.newPage();
                await extra2.goto(`${FIXTURE_URL}#extra2_c`, { waitUntil: 'load' });
                await extra2.waitForTimeout(200);

                await page.bringToFront();
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'c': 'AllExceptActive' });

                await pressChord(page, 'c');

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('extra1_c');
                expect(clip).toContain('extra2_c');
                // Active tab URL should NOT be included
                expect(clip).not.toContain('cov_content_anchor');
                const lines = clip.split('\n').filter(Boolean);
                expect(lines.length).toBe(2);
                if (DEBUG) console.log(`gYc: clipboard=${clip}`);                await extra1.close().catch(() => {});
                await extra2.close().catch(() => {});
            },
        );
    });

    // ─── gYg (AllExceptActiveAllWindows) ──────────────────────────────────────

    test('gYg copies all tab URLs except active across all windows (AllExceptActiveAllWindows)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);
                await page.waitForTimeout(100);

                // Extra tab in current window
                const extra = await context.newPage();
                await extra.goto(`${FIXTURE_URL}#extra_g`, { waitUntil: 'load' });
                await extra.waitForTimeout(200);

                // Second window
                const win2Id = await openWindowViaSW(`${FIXTURE_URL}#win2_g`);
                await page.waitForTimeout(500);

                await page.bringToFront();
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'g': 'AllExceptActiveAllWindows' });

                await pressChord(page, 'g');

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('extra_g');
                expect(clip).toContain('win2_g');
                // Active tab URL should NOT be included
                expect(clip).not.toContain('cov_content_anchor');
                const lines = clip.split('\n').filter(Boolean);
                expect(lines.length).toBeGreaterThanOrEqual(2);
                if (DEBUG) console.log(`gYg: clipboard lines=${lines.length}`);                await extra.close().catch(() => {});
                await closeWindowViaSW(win2Id).catch(() => {});
            },
        );
    });

    // ─── gYk (ChildrenTabs) ───────────────────────────────────────────────────

    test('gYk copies only direct child tab URLs (ChildrenTabs)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);
                await page.waitForTimeout(100);

                // Add an unrelated sibling
                const sibling = await openSiblingTabViaSW(context, `${FIXTURE_URL}#sibling_k`);
                await sibling.waitForTimeout(200);

                await page.bringToFront();
                await page.waitForTimeout(300);

                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'k': 'ChildrenTabs' });

                const parentTab = await getActiveTabViaSW();

                // Open 2 child tabs
                await openChildTabViaSW(parentTab.id, `${FIXTURE_URL}#child1_k`);
                await page.waitForTimeout(300);
                await openChildTabViaSW(parentTab.id, `${FIXTURE_URL}#child2_k`);
                await page.waitForTimeout(400);

                await page.bringToFront();
                await page.waitForTimeout(300);
                await pressChord(page, 'k');

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('child1_k');
                expect(clip).toContain('child2_k');
                // Sibling should NOT be included
                expect(clip).not.toContain('sibling_k');
                // Active tab should NOT be included
                expect(clip).not.toContain('cov_content_anchor');
                const lines = clip.split('\n').filter(Boolean);
                expect(lines.length).toBe(2);
                if (DEBUG) console.log(`gYk: clipboard=${clip}`);                await sibling.close().catch(() => {});
            },
        );
    });

    // ─── gYK (ChildrenTabsRecursively) ────────────────────────────────────────

    test('gYK copies child and grandchild tab URLs recursively (ChildrenTabsRecursively)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);
                await page.waitForTimeout(100);

                const sibling = await openSiblingTabViaSW(context, `${FIXTURE_URL}#sibling_K`);
                await sibling.waitForTimeout(200);

                await page.bringToFront();
                await page.waitForTimeout(300);

                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'K': 'ChildrenTabsRecursively' });

                const parentTab = await getActiveTabViaSW();

                // parent → child → grandchild
                const childId = await openChildTabViaSW(parentTab.id, `${FIXTURE_URL}#child_K`);
                await page.waitForTimeout(300);
                await openChildTabViaSW(childId, `${FIXTURE_URL}#grandchild_K`);
                await page.waitForTimeout(300);

                await page.bringToFront();
                await page.waitForTimeout(300);
                await pressChord(page, 'K');

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('child_K');
                expect(clip).toContain('grandchild_K');
                // Sibling and active tab should NOT be included
                expect(clip).not.toContain('sibling_K');
                expect(clip).not.toContain('cov_content_anchor');
                const lines = clip.split('\n').filter(Boolean);
                expect(lines.length).toBe(2);
                if (DEBUG) console.log(`gYK: clipboard=${clip}`);                await sibling.close().catch(() => {});
            },
        );
    });

    // ─── gYw (OtherWindowsNoPinned) ───────────────────────────────────────────

    test('gYw copies non-pinned tab URLs from other windows (OtherWindowsNoPinned)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);
                await page.waitForTimeout(100);

                const sw = context.serviceWorkers()[0];

                // 2nd window: no pinned tabs → should be included
                const win2Id = await openWindowViaSW(`${FIXTURE_URL}#win2_w`);
                await page.waitForTimeout(500);

                // 3rd window: has a pinned tab → should NOT be included
                const win3Id = await openWindowViaSW(`${FIXTURE_URL}#win3_w`);
                await page.waitForTimeout(500);

                // Pin the tab in win3
                const allTabs = await getAllTabsViaSW();
                const win3Tab = allTabs.find((t: any) => t.windowId === win3Id);
                await sw.evaluate((tabId: number) => {
                    return new Promise<void>((resolve) => {
                        chrome.tabs.update(tabId, { pinned: true }, () => resolve());
                    });
                }, win3Tab.id);
                await page.waitForTimeout(300);

                await page.bringToFront();
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'w': 'OtherWindowsNoPinned' });

                await pressChord(page, 'w');

                const clip = await getClipboardText(page).catch(() => '');
                // win2 tab (no pinned) should be included
                expect(clip).toContain('win2_w');
                // win3 tab (pinned) should NOT be included
                expect(clip).not.toContain('win3_w');
                // Current window active tab should NOT be included
                expect(clip).not.toContain('cov_content_anchor');
                if (DEBUG) console.log(`gYw: clipboard=${clip}`);                await closeWindowViaSW(win2Id).catch(() => {});
                await closeWindowViaSW(win3Id).catch(() => {});
            },
        );
    });

    // ─── gYW (AllOtherWindowsTabs) ────────────────────────────────────────────

    test('gYW copies all tab URLs from other windows (AllOtherWindowsTabs)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg: cov, initContentCoverageForUrl: undefined },
            test.info().title,
            async () => {
                await closeAllExcept(page);
                await page.waitForTimeout(100);

                // Second window with 2 tabs
                const win2Id = await openWindowViaSW(`${FIXTURE_URL}#win2a_W`);
                await page.waitForTimeout(500);

                const sw = context.serviceWorkers()[0];
                await sw.evaluate(({ win2Id, url }: { win2Id: number; url: string }) => {
                    return new Promise<void>((resolve) => {
                        chrome.tabs.create({ windowId: win2Id, url, active: false }, () => resolve());
                    });
                }, { win2Id, url: `${FIXTURE_URL}#win2b_W` });
                await page.waitForTimeout(500);

                await page.bringToFront();
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'W': 'AllOtherWindowsTabs' });

                await pressChord(page, 'W');

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('win2a_W');
                expect(clip).toContain('win2b_W');
                // Current window tab should NOT be included
                expect(clip).not.toContain('cov_content_anchor');
                const lines = clip.split('\n').filter(Boolean);
                expect(lines.length).toBeGreaterThanOrEqual(2);
                if (DEBUG) console.log(`gYW: clipboard lines=${lines.length}`);                await closeWindowViaSW(win2Id).catch(() => {});
            },
        );
    });
});
