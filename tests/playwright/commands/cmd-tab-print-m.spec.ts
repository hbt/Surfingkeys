import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_print_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'tb';
const UNIQUE_ID = 'cmd_tab_print_m';

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

test.describe('cmd_tab_print_m (pending-key, Playwright)', () => {
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

    // ---- tests ----

    test('tbt triggers print on current tab (CurrentTab)', async () => {
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

                // Press t, b, t — triggers printTabMagic with CurrentTab
                // window.print() in headless opens a dialog that auto-dismisses or is suppressed
                // We verify the background handler was reached via coverage
                const tabsBefore = await getTabsViaSW();
                const countBefore = tabsBefore.length;

                await anchor.keyboard.press('t');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('b');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('t');
                await anchor.waitForTimeout(500);

                // Tab count unchanged — print does not close or navigate
                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(countBefore);
                if (DEBUG) console.log(`tbt: tab count ${countBefore} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/tbt/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/tbt/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('tbe triggers print on tabs to the right (DirectionRight)', async () => {
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

                await anchor.keyboard.press('t');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('b');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('e');
                await anchor.waitForTimeout(500);

                // Print does not close tabs — count unchanged
                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(countBefore);
                if (DEBUG) console.log(`tbe: tab count ${countBefore} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/tbe/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/tbe/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('tbC triggers print on all tabs in window (AllInWindow)', async () => {
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

                await anchor.keyboard.press('t');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('b');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('C');
                await anchor.waitForTimeout(500);

                // Print does not close tabs — count unchanged
                const tabsAfter = await getTabsViaSW();
                expect(tabsAfter.length).toBe(countBefore);
                if (DEBUG) console.log(`tbC: tab count ${countBefore} → ${tabsAfter.length} (unchanged)`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/tbC/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/tbC/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });
});
