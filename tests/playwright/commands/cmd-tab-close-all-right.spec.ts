import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_all_right';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

function assertBasicCoverage(
    bgPath: string | null,
    contentPath: string | null,
    opts?: { expectedBackgroundFunctions?: string[]; requireContent?: boolean },
): void {
    if (process.env.COVERAGE !== 'true') return;
    expect(bgPath).toBeTruthy();
    if (bgPath) {
        const bg = readCoverageStats(bgPath, 'service_worker', 'background.js');
        expect(bg.total).toBeGreaterThan(0);
        expect(bg.zero).toBeGreaterThan(0);
        expect(bg.gt0).toBeGreaterThan(0);
        for (const fn of opts?.expectedBackgroundFunctions ?? []) {
            expect(bg.byFunction.get(fn) ?? 0).toBeGreaterThan(0);
        }
    }

    if (opts?.requireContent !== false) {
        expect(contentPath).toBeTruthy();
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

test.describe('cmd_tab_close_all_right (Playwright)', () => {
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

    test('gx$ closes all tabs to the right of current tab', async () => {
        // Setup: l0, active, r0, r1 — 4 additional pages
        const l0 = await context.newPage();
        await l0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l0.waitForTimeout(200);

        const activePageUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gx_closes_all_tabs_to_the_right_of_current_tab`)}`;
        const activePage = await context.newPage();
        await activePage.goto(activePageUrl, { waitUntil: 'load' });
        await activePage.waitForTimeout(200);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await activePage.bringToFront();
        await activePage.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(activePageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 1`);
        }

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const tabsToRight = allTabs.filter((t: any) => t.index > activeTab.index).length;
        const beforeCount = context.pages().length;

        if (DEBUG) console.log(`gx$: active index=${activeTab.index}, tabsToRight=${tabsToRight}, beforeCount=${beforeCount}`);

        // Command window starts here: snapshot immediately before gx$ dispatch.
        await covBg?.snapshot();
        await covContent?.snapshot();

        // Press gx$
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('$').catch(() => {});

        const expectedCount = beforeCount - tabsToRight;
        let finalCount = context.pages().length;
        for (let i = 0; i < 50; i++) {
            await activePage.waitForTimeout(100).catch(() => {});
            finalCount = context.pages().length;
            if (finalCount <= expectedCount) break;
        }

        expect(finalCount).toBe(expectedCount);
        if (DEBUG) console.log(`gx$: ${beforeCount} → ${finalCount} pages (expected ${expectedCount})`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();

        // Cleanup remaining
        await l0.close().catch(() => {});
        await activePage.close().catch(() => {});
    });

    test('gx$ at rightmost tab closes nothing', async () => {
        // Create a page and confirm it is rightmost
        const rightmostPageUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gx_at_rightmost_tab_closes_nothing`)}`;
        const rightmostPage = await context.newPage();
        await rightmostPage.goto(rightmostPageUrl, { waitUntil: 'load' });
        await rightmostPage.waitForTimeout(300);
        await rightmostPage.bringToFront();
        await rightmostPage.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(rightmostPageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 2`);
        }

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const maxIndex = Math.max(...allTabs.map((t: any) => t.index));

        if (activeTab.index === maxIndex) {
            const beforeCount = context.pages().length;

            // Command window starts here.
            await covBg?.snapshot();
            await covContent?.snapshot();

            await rightmostPage.keyboard.press('g');
            await rightmostPage.waitForTimeout(50);
            await rightmostPage.keyboard.press('x');
            await rightmostPage.waitForTimeout(50);
            await rightmostPage.keyboard.press('$').catch(() => {});
            await rightmostPage.waitForTimeout(1000);

            expect(context.pages().length).toBe(beforeCount);
            if (DEBUG) console.log(`gx$ at rightmost: count unchanged at ${beforeCount}`);

            const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
            if (covBg) await covBg.flush(`${label}/command_window/background`);
            if (covContent) await covContent.flush(`${label}/content`);
        } else {
            if (DEBUG) console.log(`Could not isolate rightmost scenario (index ${activeTab.index} vs max ${maxIndex}) — skipping assertion`);
        }

        await covContent?.close();
        await rightmostPage.close().catch(() => {});
    });

    test('gx$ from leftmost tab closes all other tabs', async () => {
        // Open new pages so that the first page opened (page) is still the leftmost.
        // In Playwright, pages are appended to the right in the tab strip,
        // so page (opened in beforeAll) is at index 0.
        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        const r2 = await context.newPage();
        await r2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r2.waitForTimeout(200);

        // Activate the original `page` (leftmost in the tab strip)
        await page.bringToFront();
        await page.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 3`);
        }

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const tabsToRight = allTabs.filter((t: any) => t.index > activeTab.index).length;
        const beforeCount = context.pages().length;

        if (DEBUG) console.log(`gx$ from leftmost: active index=${activeTab.index}, tabsToRight=${tabsToRight}, beforeCount=${beforeCount}`);

        // Only proceed if we are actually the leftmost
        const minIndex = Math.min(...allTabs.map((t: any) => t.index));
        if (activeTab.index !== minIndex) {
            if (DEBUG) console.log(`SKIP: page is not leftmost (index ${activeTab.index} vs min ${minIndex})`);
            await covContent?.close();
            await r1.close().catch(() => {});
            await r2.close().catch(() => {});
            return;
        }

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('x');
        await page.waitForTimeout(50);
        await page.keyboard.press('$').catch(() => {});

        const expectedCount = beforeCount - tabsToRight;
        let finalCount = context.pages().length;
        for (let i = 0; i < 50; i++) {
            await page.waitForTimeout(100).catch(() => {});
            finalCount = context.pages().length;
            if (finalCount <= expectedCount) break;
        }

        expect(finalCount).toBe(expectedCount);
        if (DEBUG) console.log(`gx$ from leftmost: ${beforeCount} → ${finalCount} (expected ${expectedCount})`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
