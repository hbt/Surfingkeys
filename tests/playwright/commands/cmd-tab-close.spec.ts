import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function closeTabWithCoverage(
    pageToClose: Page,
    label: string,
): Promise<{
    bgPath: string | null;
    contentPath: string | null;
}> {
    const contentCoverageUrl = `${FIXTURE_URL}#${coverageSlug(label)}`;
    await pageToClose.goto(contentCoverageUrl, { waitUntil: 'load' });
    await pageToClose.waitForTimeout(300);
    await pageToClose.bringToFront();
    await pageToClose.waitForTimeout(200);

    const covContent = await initContentCoverageForUrl?.(contentCoverageUrl);
    if (process.env.COVERAGE === 'true' && !covContent) {
        throw new Error(`Content coverage session failed to initialize for ${label}`);
    }

    try {
        await covBg?.snapshot();
        await covContent?.snapshot();

        const closePromise = pageToClose.waitForEvent('close');
        await pageToClose.keyboard.down('x').catch(() => {});

        // The page target disappears on `x`, so flush immediately after keydown.
        const contentFlushPromise = covContent?.flush(`${label}/content`).catch(() => null) ?? Promise.resolve(null);
        await closePromise;
        await pageToClose.keyboard.up('x').catch(() => {});

        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await contentFlushPromise;

        return { bgPath, contentPath };
    } finally {
        await covContent?.close().catch(() => {});
    }
}

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
    } else if (DEBUG && !contentPath) {
        console.log('Content coverage target closed before persistence; treating cmd_tab_close as background-only.');
    }
    if (contentPath) {
        const content = readCoverageStats(contentPath, 'page', 'content.js');
        expect(content.total).toBeGreaterThan(0);
        expect(content.zero).toBeGreaterThan(0);
        expect(content.gt0).toBeGreaterThan(0);
    }
}

test.describe('cmd_tab_close (Playwright)', () => {
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

    test('pressing x closes the current tab', async () => {
        const pageToClose = await context.newPage();
        const beforeCount = context.pages().length;

        const { bgPath, contentPath } = await closeTabWithCoverage(
            pageToClose,
            `${SUITE_LABEL}/${coverageSlug(test.info().title)}`,
        );

        expect(context.pages().length).toBe(beforeCount - 1);
        assertBasicCoverage(bgPath, contentPath, {
            expectedBackgroundFunctions: ['removeTab'],
            requireContent: false,
        });
        if (DEBUG) console.log(`Tab closed: ${beforeCount} → ${context.pages().length} pages`);
    });

    test('pressing x twice closes two tabs', async () => {
        const p1 = await context.newPage();
        const p2 = await context.newPage();
        const beforeCount = context.pages().length;
        const baseLabel = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;

        const first = await closeTabWithCoverage(p1, `${baseLabel}/first_close`);
        const second = await closeTabWithCoverage(p2, `${baseLabel}/second_close`);

        expect(context.pages().length).toBe(beforeCount - 2);
        assertBasicCoverage(first.bgPath, first.contentPath, {
            expectedBackgroundFunctions: ['removeTab'],
            requireContent: false,
        });
        assertBasicCoverage(second.bgPath, second.contentPath, {
            expectedBackgroundFunctions: ['removeTab'],
            requireContent: false,
        });
        if (DEBUG) console.log(`Two tabs closed: ${beforeCount} → ${context.pages().length} pages`);
    });
});
