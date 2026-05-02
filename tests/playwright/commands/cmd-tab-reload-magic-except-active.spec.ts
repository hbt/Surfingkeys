import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_reload_magic_except_active';
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

async function getTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
        });
    });
}

test.describe('cmd_tab_reload_magic_except_active (Playwright)', () => {
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

    async function closeAllExcept(keepPage: Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('cmd_tab_reload_magic_except_active reloads all except current, tab count unchanged', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/except_active_reload`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
        }

        const pages = context.pages();
        const keeper = pages[Math.floor(pages.length / 2)];
        await keeper.bringToFront();
        await keeper.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);
        const beforeTabIds = tabsBefore.map((t: any) => t.id);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(keeper, 'cmd_tab_reload_magic_except_active');
        await keeper.waitForTimeout(600);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length);

        const afterTabIds = tabsAfter.map((t: any) => t.id);
        for (const id of beforeTabIds) {
            expect(afterTabIds).toContain(id);
        }
        if (DEBUG) console.log(`cmd_tab_reload_magic_except_active: tab count ${tabsBefore.length} → ${tabsAfter.length} (unchanged)`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
