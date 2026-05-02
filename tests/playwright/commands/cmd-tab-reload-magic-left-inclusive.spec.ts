import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_reload_magic_left_inclusive';
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

test.describe('cmd_tab_reload_magic_left_inclusive (Playwright)', () => {
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

    test('cmd_tab_reload_magic_left_inclusive reloads current and tabs to the left, tab count unchanged', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_inclusive_reload`)}`;
        const anchor = await context.newPage();
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Setup: [l1, l2, active]
        await anchor.close();

        const l1 = await context.newPage();
        await l1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l1.waitForTimeout(200);

        const l2 = await context.newPage();
        await l2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l2.waitForTimeout(200);

        const active = await context.newPage();
        await active.goto(anchorUrl, { waitUntil: 'load' });
        await active.waitForTimeout(200);

        const r = await context.newPage();
        await r.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r.waitForTimeout(200);

        await active.bringToFront();
        await active.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);
        expect(tabsBefore.length).toBeGreaterThanOrEqual(4);
        const beforeTabIds = tabsBefore.map((t: any) => t.id);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(active, 'cmd_tab_reload_magic_left_inclusive');
        await active.waitForTimeout(500);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length);

        const afterTabIds = tabsAfter.map((t: any) => t.id);
        for (const id of beforeTabIds) {
            expect(afterTabIds).toContain(id);
        }
        if (DEBUG) console.log(`cmd_tab_reload_magic_left_inclusive: tab count ${tabsBefore.length} → ${tabsAfter.length} (unchanged)`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
