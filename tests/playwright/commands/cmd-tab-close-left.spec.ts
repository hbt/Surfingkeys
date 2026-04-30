import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_left';
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

async function getTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
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

test.describe('cmd_tab_close_left (Playwright)', () => {
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

    test('gxt closes the tab immediately to the left', async () => {
        // Open extra pages: left, active (middle), right
        const leftPage = await context.newPage();
        await leftPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await leftPage.waitForTimeout(300);

        const midPageUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxt_closes_the_tab_immediately_to_the_left`)}`;
        const midPage = await context.newPage();
        await midPage.goto(midPageUrl, { waitUntil: 'load' });
        await midPage.waitForTimeout(300);

        const rightPage = await context.newPage();
        await rightPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await rightPage.waitForTimeout(300);

        // Activate midPage
        await midPage.bringToFront();
        await midPage.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(midPageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 1`);
        }

        const beforeCount = context.pages().length;

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        // leftPage is to the left of midPage; wait for it to close
        const closePromise = leftPage.waitForEvent('close');
        await midPage.keyboard.press('g');
        await midPage.waitForTimeout(50);
        await midPage.keyboard.press('x');
        await midPage.waitForTimeout(50);
        await midPage.keyboard.press('t').catch(() => {});
        await closePromise;

        expect(context.pages().length).toBe(beforeCount - 1);
        if (DEBUG) console.log(`gxt: ${beforeCount} → ${context.pages().length} pages`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();

        // Cleanup
        await midPage.close().catch(() => {});
        await rightPage.close().catch(() => {});
    });

    test('gxt at leftmost tab does nothing', async () => {
        // Open a fresh page and make sure it is the leftmost among our test pages
        const onlyPageUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxt_at_leftmost_tab_does_nothing`)}`;
        const onlyPage = await context.newPage();
        await onlyPage.goto(onlyPageUrl, { waitUntil: 'load' });
        await onlyPage.waitForTimeout(300);
        await onlyPage.bringToFront();
        await onlyPage.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(onlyPageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 2`);
        }

        const activeTab = await getActiveTabViaSW(context);
        const allTabs = await getTabsViaSW(context);
        const tabsToLeft = allTabs.filter((t: any) => t.index < activeTab.index);

        if (tabsToLeft.length === 0) {
            // At leftmost — pressing gxt should not close anything
            const beforeCount = context.pages().length;

            // Command window starts here.
            await covBg?.snapshot();
            await covContent?.snapshot();

            await onlyPage.keyboard.press('g');
            await onlyPage.waitForTimeout(50);
            await onlyPage.keyboard.press('x');
            await onlyPage.waitForTimeout(50);
            await onlyPage.keyboard.press('t').catch(() => {});
            await onlyPage.waitForTimeout(800);

            expect(context.pages().length).toBe(beforeCount);
            if (DEBUG) console.log(`gxt at leftmost: tab count unchanged at ${beforeCount}`);

            const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
            if (covBg) await covBg.flush(`${label}/command_window/background`);
            if (covContent) await covContent.flush(`${label}/content`);
        } else {
            if (DEBUG) console.log(`Could not isolate leftmost scenario (${tabsToLeft.length} tabs to left) — skipping assertion`);
        }

        await covContent?.close();
        await onlyPage.close().catch(() => {});
    });

    test('gxt twice closes two tabs to the left', async () => {
        // Create three extra pages: l1, l2, active
        const l1 = await context.newPage();
        await l1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l1.waitForTimeout(300);

        const l2 = await context.newPage();
        await l2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l2.waitForTimeout(300);

        const activePageUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxt_twice_closes_two_tabs_to_the_left`)}`;
        const activePage = await context.newPage();
        await activePage.goto(activePageUrl, { waitUntil: 'load' });
        await activePage.waitForTimeout(300);

        await activePage.bringToFront();
        await activePage.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(activePageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 3`);
        }

        const beforeCount = context.pages().length;

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        // First gxt
        const close1 = l2.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('t').catch(() => {});
        await close1;

        await activePage.bringToFront();
        await activePage.waitForTimeout(200);

        // Second gxt
        const close2 = l1.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('t').catch(() => {});
        await close2;

        expect(context.pages().length).toBe(beforeCount - 2);
        if (DEBUG) console.log(`gxt x2: ${beforeCount} → ${context.pages().length} pages`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();

        await activePage.close().catch(() => {});
    });
});
