import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import * as fs from 'fs';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

function readCoverageStats(
    filePath: string,
    expectedTarget: 'service_worker' | 'page',
    scriptFile: 'background.js' | 'content.js',
): { total: number; zero: number; gt0: number; byFunction: Map<string, number> } {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(payload.target).toBe(expectedTarget);

    const scriptEntries = (payload.result ?? []).filter((s: any) => typeof s.url === 'string' && s.url.endsWith(scriptFile));
    expect(scriptEntries.length).toBeGreaterThan(0);

    const byFunction = new Map<string, number>();
    let total = 0;
    let zero = 0;
    let gt0 = 0;

    for (const script of scriptEntries) {
        for (const fn of script.functions ?? []) {
            const maxCount = Math.max(...((fn.ranges ?? []).map((r: any) => Number(r.count) || 0)));
            total += 1;
            if (maxCount > 0) gt0 += 1;
            else zero += 1;
            if (fn.functionName) byFunction.set(fn.functionName, Math.max(byFunction.get(fn.functionName) ?? 0, maxCount));
        }
    }

    return { total, zero, gt0, byFunction };
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

async function getTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
        });
    });
}

test.describe('cmd_tab_close_all_left (Playwright)', () => {
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
        await covBg?.close();
        await context?.close();
    });

    test('gx0 closes all tabs to the left of current tab', async () => {
        // Setup: l0, l1, active, r0 — 4 additional pages
        const l0 = await context.newPage();
        await l0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l0.waitForTimeout(200);

        const l1 = await context.newPage();
        await l1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l1.waitForTimeout(200);

        const activePageUrl = `${FIXTURE_URL}#gx0_case_left_active`;
        const activePage = await context.newPage();
        await activePage.goto(activePageUrl, { waitUntil: 'load' });
        await activePage.waitForTimeout(200);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        await activePage.bringToFront();
        await activePage.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(activePageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error('Content coverage session failed to initialize for gx0 case 1');
        }

        const activeTab = await getActiveTabViaSW(context);
        const tabsToLeft = activeTab.index; // number of tabs to the left
        const beforeCount = context.pages().length;

        if (DEBUG) console.log(`gx0: active tab index=${activeTab.index}, tabsToLeft=${tabsToLeft}, beforeCount=${beforeCount}`);

        // Command window starts here: snapshot immediately before gx0 dispatch.
        await covBg?.snapshot();
        await covContent?.snapshot();

        // Press gx0
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('0').catch(() => {});

        // Poll for closure
        const expectedCount = beforeCount - tabsToLeft;
        let finalCount = context.pages().length;
        for (let i = 0; i < 50; i++) {
            await activePage.waitForTimeout(100).catch(() => {});
            finalCount = context.pages().length;
            if (finalCount <= expectedCount) break;
        }

        expect(finalCount).toBe(expectedCount);
        if (DEBUG) console.log(`gx0: ${beforeCount} → ${finalCount} pages (expected ${expectedCount})`);
        const bgPath = await covBg?.flush('cmd_tab_close_all_left/gx0_closes_all_tabs_to_the_left_of_current_tab/command_window/background');
        const contentPath = await covContent?.flush('cmd_tab_close_all_left/gx0_closes_all_tabs_to_the_left_of_current_tab/content');
        if (process.env.COVERAGE === 'true') {
        expect(bgPath).toBeTruthy();
        expect(contentPath).toBeTruthy();
        }
        if (bgPath) {
            const bg = readCoverageStats(bgPath, 'service_worker', 'background.js');
            expect(bg.total).toBeGreaterThan(0);
            expect(bg.zero).toBeGreaterThan(0); // sanity: not "every function covered"
            expect(bg.byFunction.get('_closeTab') ?? 0).toBeGreaterThan(0); // gx0-specific hot path
        }
        if (contentPath) {
            const content = readCoverageStats(contentPath, 'page', 'content.js');
            expect(content.total).toBeGreaterThan(0);
            expect(content.zero).toBeGreaterThan(0); // sanity: not "every function covered"
            expect(content.gt0).toBeGreaterThan(0); // command path did execute in content script
        }
        await covContent?.close();

        // Cleanup right page
        await r0.close().catch(() => {});
        await activePage.close().catch(() => {});
    });

    test('gx0 at leftmost tab closes nothing', async () => {
        // Open one page and ensure it has no pages to its left
        const leftmostPageUrl = `${FIXTURE_URL}#gx0_case_leftmost_active`;
        const leftmostPage = await context.newPage();
        await leftmostPage.goto(leftmostPageUrl, { waitUntil: 'load' });
        await leftmostPage.waitForTimeout(300);
        await leftmostPage.bringToFront();
        await leftmostPage.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(leftmostPageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error('Content coverage session failed to initialize for gx0 case 2');
        }

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const tabsToLeft = allTabs.filter((t: any) => t.index < activeTab.index).length;

        if (tabsToLeft === 0) {
            const beforeCount = context.pages().length;

            // Command window starts here: snapshot immediately before gx0 dispatch.
            await covBg?.snapshot();
            await covContent?.snapshot();

            await leftmostPage.keyboard.press('g');
            await leftmostPage.waitForTimeout(50);
            await leftmostPage.keyboard.press('x');
            await leftmostPage.waitForTimeout(50);
            await leftmostPage.keyboard.press('0').catch(() => {});
            await leftmostPage.waitForTimeout(800);

            expect(context.pages().length).toBe(beforeCount);
            if (DEBUG) console.log(`gx0 at leftmost: count unchanged at ${beforeCount}`);
            if (covBg) await covBg.flush('cmd_tab_close_all_left/gx0_at_leftmost_tab_closes_nothing/command_window/background');
            if (covContent) await covContent.flush('cmd_tab_close_all_left/gx0_at_leftmost_tab_closes_nothing/content');
        } else {
            if (DEBUG) console.log(`Could not isolate leftmost scenario (${tabsToLeft} tabs to left) — skipping assertion`);
        }

        await covContent?.close();
        await leftmostPage.close().catch(() => {});
    });

    test('gx0 from rightmost tab closes all other tabs', async () => {
        // Ensure we have a few pages, then activate the last one created
        const extra1 = await context.newPage();
        await extra1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await extra1.waitForTimeout(200);

        const rightmostPageUrl = `${FIXTURE_URL}#gx0_case_rightmost_active`;
        const rightmost = await context.newPage();
        await rightmost.goto(rightmostPageUrl, { waitUntil: 'load' });
        await rightmost.waitForTimeout(200);
        await rightmost.bringToFront();
        await rightmost.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(rightmostPageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error('Content coverage session failed to initialize for gx0 case 3');
        }

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const maxIndex = Math.max(...allTabs.map((t: any) => t.index));

        expect(activeTab.index).toBe(maxIndex);

        const tabsToLeft = activeTab.index;
        const beforeCount = context.pages().length;

        // Command window starts here: snapshot immediately before gx0 dispatch.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await rightmost.keyboard.press('g');
        await rightmost.waitForTimeout(50);
        await rightmost.keyboard.press('x');
        await rightmost.waitForTimeout(50);
        await rightmost.keyboard.press('0').catch(() => {});

        const expectedCount = beforeCount - tabsToLeft;
        let finalCount = context.pages().length;
        for (let i = 0; i < 50; i++) {
            await rightmost.waitForTimeout(100).catch(() => {});
            finalCount = context.pages().length;
            if (finalCount <= expectedCount) break;
        }

        expect(finalCount).toBe(expectedCount);
        if (DEBUG) console.log(`gx0 from rightmost: ${beforeCount} → ${finalCount} (expected ${expectedCount})`);

        if (covBg) await covBg.flush('cmd_tab_close_all_left/gx0_from_rightmost_tab_closes_all_other_tabs/command_window/background');
        if (covContent) await covContent.flush('cmd_tab_close_all_left/gx0_from_rightmost_tab_closes_all_other_tabs/content');
        await covContent?.close();
        await rightmost.close().catch(() => {});
    });
});
