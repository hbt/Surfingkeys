import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_others';
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

test.describe('cmd_tab_close_others (Playwright)', () => {
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

    test('gxx closes all tabs except the current one', async () => {
        // Open extra pages so we have several to close
        const extras: Page[] = [];
        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
            extras.push(p);
        }

        // Pick the middle page as the active one that should survive
        const keeperUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxx_closes_all_tabs_except_the_current_one`)}`;
        const keeper = extras[1];
        await keeper.goto(keeperUrl, { waitUntil: 'load' });
        await keeper.waitForTimeout(200);
        await keeper.bringToFront();
        await keeper.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(keeperUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 1`);
        }

        const activeTab = await getActiveTabViaSW(context);
        const beforeCount = context.pages().length;
        if (DEBUG) console.log(`gxx: before=${beforeCount}, keeper tab id=${activeTab.id}`);

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        // Press gxx — all other tabs will close; keeper stays
        // We use a broad waitForTimeout since many tabs close at once
        await keeper.keyboard.press('g');
        await keeper.waitForTimeout(50);
        await keeper.keyboard.press('x');
        await keeper.waitForTimeout(50);
        await keeper.keyboard.press('x').catch(() => {});

        // Poll until only 1 fixture tab remains (with up to 5s)
        let finalCount = context.pages().length;
        for (let i = 0; i < 50; i++) {
            await keeper.waitForTimeout(100).catch(() => {});
            finalCount = context.pages().length;
            if (finalCount <= 1) break;
        }

        // The keeper page should still be alive, all others closed
        expect(finalCount).toBe(1);
        if (DEBUG) console.log(`gxx: ${beforeCount} → ${finalCount} pages`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('gxx with single tab does nothing', async () => {
        // After the previous test only 1 page remains; re-use it
        const pages = context.pages();
        // If somehow more pages exist, close extras
        for (let i = 1; i < pages.length; i++) {
            await pages[i].close().catch(() => {});
        }

        let activePage = context.pages()[0];
        if (!activePage) {
            // Recreate if needed
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(300);
            activePage = context.pages()[0];
        }

        const singlePageUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxx_with_single_tab_does_nothing`)}`;
        await activePage.goto(singlePageUrl, { waitUntil: 'load' });
        await activePage.waitForTimeout(200);
        await activePage.bringToFront();
        await activePage.waitForTimeout(200);
        const covContent = await initContentCoverageForUrl?.(singlePageUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 2`);
        }

        const beforeCount = context.pages().length;

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('x').catch(() => {});
        await activePage.waitForTimeout(800).catch(() => {});

        expect(context.pages().length).toBe(beforeCount);
        if (DEBUG) console.log(`gxx single tab: count unchanged at ${beforeCount}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        if (covBg) await covBg.flush(`${label}/command_window/background`);
        if (covContent) await covContent.flush(`${label}/content`);
        await covContent?.close();
    });
});
