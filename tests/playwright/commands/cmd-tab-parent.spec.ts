import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const SUITE_LABEL = 'cmd_tab_parent';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

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

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.tabs.query({ currentWindow: true, active: true }, (tabs: any[]) => resolve(tabs[0]));
        });
    });
}

test.describe('cmd_tab_parent (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
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

    test('cmd_tab_parent switches to the opener (parent) tab', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/parent`)}`;

        // Open parent (anchor) tab
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await anchor.bringToFront();
        await anchor.waitForTimeout(300);

        // Get parent tab id via SW
        const parentTab = await getActiveTabViaSW(context);
        expect(parentTab).toBeTruthy();
        const parentTabId: number = parentTab.id;

        // Open child tab from the anchor page using window.open so openerTabId is set
        const childUrl = `${FIXTURE_URL}#child`;
        const childPagePromise = context.waitForEvent('page');
        await anchor.evaluate((url: string) => { window.open(url); }, childUrl);
        const childPage = await childPagePromise;
        await childPage.waitForLoadState('load');
        await childPage.bringToFront();
        await childPage.waitForTimeout(500);

        await callSKApi(childPage, 'unmapAllExcept', []);
        await callSKApi(childPage, 'mapcmdkey', 'gK', 'cmd_tab_parent');

        const covContent = await initContentCoverageForUrl?.(childUrl);
        await covBg?.snapshot();
        await covContent?.snapshot();

        // Press gK to go to parent tab
        await childPage.keyboard.press('g');
        await childPage.waitForTimeout(50);
        await childPage.keyboard.press('K');
        await childPage.waitForTimeout(500);

        const activeTab = await getActiveTabViaSW(context);
        expect(activeTab.id).toBe(parentTabId);
        if (DEBUG) console.log(`Active tab: ${activeTab.id} (expected parent: ${parentTabId})`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`).catch(() => null) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close().catch(() => {});

        // Cleanup child tab
        await childPage.close().catch(() => {});
    });
});
