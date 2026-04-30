import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_right';
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

test.describe('cmd_tab_close_right (Playwright)', () => {
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

    test('gxT closes the tab immediately to the right', async () => {
        // Ensure we have: active page, then a rightPage after it
        const activePageUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxT_closes_the_tab_immediately_to_the_right`)}`;
        const activePage = await context.newPage();
        await activePage.goto(activePageUrl, { waitUntil: 'load' });
        await activePage.waitForTimeout(300);

        const rightPage = await context.newPage();
        await rightPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await rightPage.waitForTimeout(300);

        await activePage.bringToFront();
        await activePage.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(activePageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 1`);
        }

        const beforeCount = context.pages().length;

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        const closePromise = rightPage.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('T').catch(() => {});
        await closePromise;

        expect(context.pages().length).toBe(beforeCount - 1);
        if (DEBUG) console.log(`gxT: ${beforeCount} → ${context.pages().length} pages`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();

        await activePage.close().catch(() => {});
    });

    test('gxT at rightmost tab does nothing', async () => {
        // Create a page and make sure there are no tabs to its right
        const rightmostPageUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxT_at_rightmost_tab_does_nothing`)}`;
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
            await rightmostPage.keyboard.press('T').catch(() => {});
            await rightmostPage.waitForTimeout(800);

            expect(context.pages().length).toBe(beforeCount);
            if (DEBUG) console.log(`gxT at rightmost: tab count unchanged at ${beforeCount}`);

            const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
            if (covBg) await covBg.flush(`${label}/command_window/background`);
            if (covContent) await covContent.flush(`${label}/content`);
        } else {
            if (DEBUG) console.log(`Could not isolate rightmost scenario (index ${activeTab.index} vs max ${maxIndex}) — skipping assertion`);
        }

        await covContent?.close();
        await rightmostPage.close().catch(() => {});
    });

    test('gxT twice closes two tabs to the right', async () => {
        const activePageUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxT_twice_closes_two_tabs_to_the_right`)}`;
        const activePage = await context.newPage();
        await activePage.goto(activePageUrl, { waitUntil: 'load' });
        await activePage.waitForTimeout(300);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(300);

        const r2 = await context.newPage();
        await r2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r2.waitForTimeout(300);

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

        // First gxT closes r1
        const close1 = r1.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('T').catch(() => {});
        await close1;

        await activePage.bringToFront();
        await activePage.waitForTimeout(200);

        // Second gxT closes r2 (now directly to the right)
        const close2 = r2.waitForEvent('close');
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('T').catch(() => {});
        await close2;

        expect(context.pages().length).toBe(beforeCount - 2);
        if (DEBUG) console.log(`gxT x2: ${beforeCount} → ${context.pages().length} pages`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();

        await activePage.close().catch(() => {});
    });
});
