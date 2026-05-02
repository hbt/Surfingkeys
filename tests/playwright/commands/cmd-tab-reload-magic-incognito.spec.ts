import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_reload_magic_incognito';
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

test.describe('cmd_tab_reload_magic_incognito (Playwright)', () => {
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

    test('cmd_tab_reload_magic_incognito is no-op when no incognito tabs visible, tab count unchanged', async () => {
        // In the non-incognito test context, chrome.tabs.query({}) from the regular SW
        // returns only regular tabs, so AllIncognitoTabs always resolves to an empty list
        // and the command is a no-op. This test verifies the command executes without error
        // and leaves regular tabs intact.
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/incognito_noop`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const beforeCount = context.pages().length;

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_reload_magic_incognito');
        await anchor.waitForTimeout(500);

        expect(context.pages().length).toBe(beforeCount);
        if (DEBUG) console.log(`cmd_tab_reload_magic_incognito: no-op, count unchanged at ${beforeCount}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
