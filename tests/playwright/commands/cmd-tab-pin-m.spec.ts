import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_pin_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'gP';
const UNIQUE_ID = 'cmd_tab_pin_m';

let context: BrowserContext;
let page: Page;
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

async function getTabPinnedViaSW(ctx: BrowserContext, tabId?: number): Promise<boolean> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((id?: number) => {
        return new Promise<boolean>((resolve) => {
            const query = id !== undefined ? { active: true, currentWindow: true } : { active: true, currentWindow: true };
            chrome.tabs.query(query, (tabs) => {
                resolve(tabs[0]?.pinned ?? false);
            });
        });
    }, tabId);
}

async function unpinCurrentTab(ctx: BrowserContext): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate(() => {
        return new Promise<void>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) { resolve(); return; }
                chrome.tabs.update(tabs[0].id!, { pinned: false }, () => resolve());
            });
        });
    });
}

test.describe('cmd_tab_pin_m (pending-key, Playwright)', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await unpinCurrentTab(context).catch(() => {});
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await unpinCurrentTab(context).catch(() => {});
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
        await setConf(page, 'magicKeys', { 't': 'CurrentTab' });
    });

    test.afterEach(async () => {
        await unpinCurrentTab(context).catch(() => {});
    });

    test('gPt pins the current tab', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.bringToFront();
                await page.waitForTimeout(200);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                const before = await getTabPinnedViaSW(context);
                expect(before).toBe(false);

                await page.keyboard.press('g');
                await page.waitForTimeout(50);
                await page.keyboard.press('P');
                await page.waitForTimeout(50);
                await page.keyboard.press('t');
                await page.waitForTimeout(400);

                const after = await getTabPinnedViaSW(context);
                expect(after).toBe(true);
                if (DEBUG) console.log(`gPt: pin ${before} → ${after}`);

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
                await page.bringToFront();
                await page.waitForTimeout(200);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                // Pin
                await page.keyboard.press('g');
                await page.waitForTimeout(50);
                await page.keyboard.press('P');
                await page.waitForTimeout(50);
                await page.keyboard.press('t');
                await page.waitForTimeout(400);
                expect(await getTabPinnedViaSW(context)).toBe(true);

                // Unpin
                await page.keyboard.press('g');
                await page.waitForTimeout(50);
                await page.keyboard.press('P');
                await page.waitForTimeout(50);
                await page.keyboard.press('t');
                await page.waitForTimeout(400);
                expect(await getTabPinnedViaSW(context)).toBe(false);
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
});
