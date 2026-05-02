import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_tab_copy_urls_magic_left_inclusive';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

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

async function closeAllExcept(keepPage: Page): Promise<void> {
    for (const p of context.pages()) {
        if (p !== keepPage) await p.close().catch(() => {});
    }
    await keepPage.bringToFront();
    await keepPage.waitForTimeout(200);
}

async function createPage(url: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    return page;
}

async function readClipboard(page: Page): Promise<string> {
    return page.evaluate(() => navigator.clipboard.readText());
}

async function expectClipboardForCommand(
    page: Page,
    uniqueId: string,
    expectedUrls: string[],
    repeats?: number,
): Promise<void> {
    const ok = await invokeCommand(page, uniqueId, repeats);
    expect(ok).toBe(true);
    await page.waitForTimeout(200);
    const clipboard = await readClipboard(page);
    expect(clipboard).toBe(expectedUrls.join('\n'));
}

test.describe('cmd_tab_copy_urls_magic_left_inclusive (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const p = await context.newPage();
        await p.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_tab_copy_urls_magic_left_inclusive copies current and all tabs to the left', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Setup: [left2, left1, anchor, right1]
                // No repeat (repeats==null) → anchor-first reversed: [anchorUrl, left1Url, left2Url]
                const left2Url = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_2`)}`;
                const left1Url = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_1`)}`;
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/anchor`)}`;
                const right1Url = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/right_1`)}`;

                await closeAllExcept(await createPage(left2Url));
                await createPage(left1Url);
                const anchor = await createPage(anchorUrl);
                await createPage(right1Url);
                await anchor.bringToFront();
                await anchor.waitForTimeout(200);

                const covContent = await initContentCoverageForUrl?.(anchorUrl);

                await covBg?.snapshot();
                await covContent?.snapshot();
                // DirectionLeftInclusive with no repeat → current + all left, anchor-first reversed
                await expectClipboardForCommand(anchor, 'cmd_tab_copy_urls_magic_left_inclusive', [anchorUrl, left1Url, left2Url]);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });
});
