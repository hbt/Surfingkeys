import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_magic_all_window';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

function assertBasicCoverage(
    bgPath: string | null,
    contentPath: string | null,
    opts?: { requireContent?: boolean },
): void {
    if (process.env.COVERAGE !== 'true') return;
    expect(bgPath).toBeTruthy();
    if (bgPath) {
        const bg = readCoverageStats(bgPath, 'service_worker', 'background.js');
        expect(bg.total).toBeGreaterThan(0);
        expect(bg.zero).toBeGreaterThan(0);
        expect(bg.gt0).toBeGreaterThan(0);
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

async function waitForHttpPageCount(ctx: BrowserContext, expected: number) {
    for (let i = 0; i < 50; i++) {
        const httpCount = ctx.pages().filter(p => p.url().startsWith('http')).length;
        if (httpCount <= expected) break;
        await new Promise(r => setTimeout(r, 100));
    }
}

test.describe('cmd_tab_close_magic_all_window (Playwright)', () => {
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

    test('cmd_tab_close_magic_all_window closes all tabs in current window including active', async () => {
        // Active tab itself is closed — use contentFlushPromise pattern.
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_all_window_closes_all_tabs_in_current_window`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        const extra = await context.newPage();
        await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
        await extra.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(2);

        await covBg?.snapshot();
        await covContent?.snapshot();

        const contentFlushPromise = covContent?.flush(`${SUITE_LABEL}/${coverageSlug(test.info().title)}/content`).catch(() => null) ?? Promise.resolve(null);
        await invokeCommand(anchor, 'cmd_tab_close_magic_all_window').catch(() => {});

        // Chrome keeps the last tab alive rather than closing the window entirely.
        await waitForHttpPageCount(context, 0);
        const httpPages = context.pages().filter(p => p.url().startsWith('http')).length;
        expect(httpPages).toBeLessThanOrEqual(1);
        if (DEBUG) console.log(`cmd_tab_close_magic_all_window: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await contentFlushPromise;
        assertBasicCoverage(bgPath, contentPath, { requireContent: false });
        await covContent?.close().catch(() => {});
    });
});
