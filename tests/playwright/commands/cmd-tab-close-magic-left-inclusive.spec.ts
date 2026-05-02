import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_magic_left_inclusive';
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

test.describe('cmd_tab_close_magic_left_inclusive (Playwright)', () => {
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

    test('cmd_tab_close_magic_left_inclusive closes current + all to the left', async () => {
        // The active tab itself is closed — use the manual close pattern.
        const base = await context.newPage();
        await base.goto(FIXTURE_URL, { waitUntil: 'load' });
        await closeAllExcept(base);

        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1Url = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/cmd_tab_close_magic_left_inclusive_closes_current_all_to_the_left`)}`;
        const r1 = await context.newPage();
        await r1.goto(r1Url, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await r1.bringToFront();
        await r1.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(r1Url);

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(3);

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        // r1 (rightmost) + 2 to the left = 3 tabs closed (r1 itself is closed)
        // Fire content flush immediately — the r1 target disappears on invocation.
        const contentFlushPromise = covContent?.flush(`${SUITE_LABEL}/${coverageSlug(test.info().title)}/content`).catch(() => null) ?? Promise.resolve(null);
        await invokeCommand(r1, 'cmd_tab_close_magic_left_inclusive').catch(() => {});

        const expectedLeft = beforeCount - 3;
        // Chrome won't close the last tab in a window; allow 1 surviving tab when all are targeted.
        await waitForHttpPageCount(context, Math.max(expectedLeft, 1));
        const httpPagesLeft = context.pages().filter(p => p.url().startsWith('http')).length;
        expect(httpPagesLeft).toBeLessThanOrEqual(Math.max(expectedLeft, 1));
        if (DEBUG) console.log(`cmd_tab_close_magic_left_inclusive: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await contentFlushPromise;
        assertBasicCoverage(bgPath, contentPath, { requireContent: false });
        await covContent?.close().catch(() => {});
    });
});
