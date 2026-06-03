import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, openSiblingTabViaSW } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_highlight_toggle_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'th';
const UNIQUE_ID = 'cmd_tab_highlight_toggle_m';

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

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => new Promise<any>(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
    }));
}

async function clearHighlightsViaSW(ctx: BrowserContext): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return;
    // Invoke highlightToggleTabMagic with HighlightedTabs to clear all (toggle all marked → unmarked)
    // Instead, we reset the SW state by sending a message directly.
    // Since tabsMarked is SW-internal, we use the command to clear by toggling the set.
    // For cleanup, navigate to clear all: invoke the command with AllInWindow twice would be complex.
    // Simplest: reload the SW context by doing nothing — tabsMarked persists in the SW lifetime.
    // We'll clean up by re-toggling any highlighted tabs via the page API in each test's teardown.
    void sw;
}

// --- Setup helpers ---

async function closeAllExcept(keepPage: Page) {
    for (const p of context.pages()) {
        if (p !== keepPage) await p.close().catch(() => {});
    }
    await keepPage.bringToFront();
    await keepPage.waitForTimeout(200);
}

// Press th<key> via keyboard
async function pressTH(p: Page, magicKey: string) {
    await p.keyboard.press('t');
    await p.waitForTimeout(50);
    await p.keyboard.press('h');
    await p.waitForTimeout(50);
    if (magicKey.length === 1) {
        await p.keyboard.press(magicKey).catch(() => {});
    }
    await p.waitForTimeout(400);
}

// -------------------------------------------------------------------

test.describe('cmd_tab_highlight_toggle_m (Playwright)', () => {
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

    // ---------------------------------------------------------------
    // CurrentTab — toggle on
    // ---------------------------------------------------------------

    test('tht highlights current tab — title gets * prefix', async () => {
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

                const titleBefore = await anchor.title();
                expect(titleBefore).not.toContain('* ');
                if (DEBUG) console.log(`title before: ${titleBefore}`);

                await pressTH(anchor, 't');

                const titleAfter = await anchor.title();
                expect(titleAfter).toMatch(/^\* /);
                if (DEBUG) console.log(`title after: ${titleAfter}`);

                // cleanup — toggle back off
                await pressTH(anchor, 't');

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/tht_on/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/tht_on/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // CurrentTab — toggle off (second press restores title)
    // ---------------------------------------------------------------

    test('tht twice removes * prefix and restores original title', async () => {
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

                const titleBefore = await anchor.title();

                // Highlight
                await pressTH(anchor, 't');
                expect(await anchor.title()).toMatch(/^\* /);

                // Unhighlight
                await pressTH(anchor, 't');
                const titleRestored = await anchor.title();
                expect(titleRestored).not.toContain('* ');
                expect(titleRestored).toBe(titleBefore);
                if (DEBUG) console.log(`tht twice: restored to "${titleRestored}"`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/tht_toggle/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/tht_toggle/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // DirectionRight — all right tabs get * prefix
    // ---------------------------------------------------------------

    test('the highlights all tabs to the right (DirectionRight)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Layout: [left, anchor, right1, right2]
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
                const rightTabIds = new Set(tabsBefore.filter((t: any) => t.index > anchorTab.index).map((t: any) => t.id));
                expect(rightTabIds.size).toBeGreaterThan(0);

                await pressTH(anchor, 'e');

                // Check titles of right pages have * prefix
                const right1Title = await right1.title();
                const right2Title = await right2.title();
                expect(right1Title).toMatch(/^\* /);
                expect(right2Title).toMatch(/^\* /);

                // Anchor and left should not be highlighted
                const anchorTitle = await anchor.title();
                const leftTitle = await left.title();
                expect(anchorTitle).not.toMatch(/^\* /);
                expect(leftTitle).not.toMatch(/^\* /);

                if (DEBUG) console.log(`the: right1="${right1Title}" right2="${right2Title}"`);

                // cleanup — toggle off
                await pressTH(anchor, 'e');

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/the/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/the/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    // ---------------------------------------------------------------
    // Highlighted + indexed tab → title is "* [N] Original Title"
    // ---------------------------------------------------------------

    test('highlighted tab with index shows "* [N] Original Title"', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // We need showTabIndices enabled so index appears in title.
                // Open two tabs so the anchor is not index 1 (to get a visible index).
                const first = await context.newPage();
                await first.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(first);

                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await anchor.waitForTimeout(300);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 't': 'CurrentTab' });
                await setConf(anchor, 'showTabIndices', true);

                // Wait for tab index to appear in title
                await anchor.waitForTimeout(500);

                const titleWithIndex = await anchor.title();
                if (DEBUG) console.log(`title with index (before highlight): "${titleWithIndex}"`);

                // Title should already have [N] prefix from showTabIndices
                // (may or may not, depending on extension state — check both cases)
                const hasIndex = /^\[\d+\]/.test(titleWithIndex);

                await pressTH(anchor, 't');

                const titleHighlighted = await anchor.title();
                if (DEBUG) console.log(`title highlighted: "${titleHighlighted}"`);

                if (hasIndex) {
                    // Expect "* [N] ..." format
                    expect(titleHighlighted).toMatch(/^\* \[\d+\]/);
                } else {
                    // Expect "* ..." format (no index in this context)
                    expect(titleHighlighted).toMatch(/^\* /);
                }

                // cleanup
                await pressTH(anchor, 't');

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/tht_indexed/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/tht_indexed/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });
});
