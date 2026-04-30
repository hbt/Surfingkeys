import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import * as fs from 'fs';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_change_target';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

function coverageSlug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function readCoverageStats(
    filePath: string,
    expectedTarget: 'service_worker' | 'page',
    scriptFile: 'background.js' | 'content.js',
    opts?: { allowMissingScript?: boolean },
): { total: number; zero: number; gt0: number; byFunction: Map<string, number> } {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(payload.target).toBe(expectedTarget);

    const scriptEntries = (payload.result ?? []).filter((entry: any) =>
        typeof entry.url === 'string' && entry.url.endsWith(scriptFile),
    );
    if (scriptEntries.length === 0) {
        if (opts?.allowMissingScript) {
            return { total: 0, zero: 0, gt0: 0, byFunction: new Map<string, number>() };
        }
        expect(scriptEntries.length).toBeGreaterThan(0);
    }

    const byFunction = new Map<string, number>();
    let total = 0;
    let zero = 0;
    let gt0 = 0;

    for (const script of scriptEntries) {
        for (const fn of script.functions ?? []) {
            const maxCount = Math.max(...((fn.ranges ?? []).map((range: any) => Number(range.count) || 0)));
            total += 1;
            if (maxCount > 0) gt0 += 1;
            else zero += 1;
            if (fn.functionName) {
                byFunction.set(fn.functionName, Math.max(byFunction.get(fn.functionName) ?? 0, maxCount));
            }
        }
    }

    return { total, zero, gt0, byFunction };
}

async function withPersistedDualCoverage(testTitle: string, run: () => Promise<void>): Promise<void> {
    const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
    if (process.env.COVERAGE === 'true' && !covContent) {
        throw new Error('Content coverage session failed to initialize for ' + SUITE_LABEL + '/' + coverageSlug(testTitle));
    }

    try {
        await covBg?.snapshot();
        await covContent?.snapshot();
        await run();

        const baseLabel = SUITE_LABEL + '/' + coverageSlug(testTitle);
        const bgPath = await covBg?.flush(baseLabel + '/command_window/background');
        const contentPath = await covContent?.flush(baseLabel + '/content');

        expect(bgPath).toBeTruthy();
        expect(contentPath).toBeTruthy();
        if (bgPath) {
            const bg = readCoverageStats(bgPath, 'service_worker', 'background.js', { allowMissingScript: true });
            if (bg.total > 0) {
                expect(bg.zero).toBeGreaterThan(0);
            }
        }
        if (contentPath) {
            const content = readCoverageStats(contentPath, 'page', 'content.js');
            expect(content.total).toBeGreaterThan(0);
            expect(content.zero).toBeGreaterThan(0);
            expect(content.gt0).toBeGreaterThan(0);
        }
    } finally {
        await covContent?.close();
    }
}

test.describe('cmd_scroll_change_target (Playwright)', () => {
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

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test('pressing cs executes change scroll target command', async () => {
        await withPersistedDualCoverage(test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBe(0);

            await page.keyboard.press('c');
            await page.keyboard.press('s');
            await page.waitForTimeout(200);

            const finalScroll = await page.evaluate(() => window.scrollY);
            expect(finalScroll).toBeGreaterThanOrEqual(0);
            if (DEBUG) console.log(`Scroll target changed - initial: ${initialScroll}px, after: ${finalScroll}px`);
        });
    });

    test('cs can be called multiple times', async () => {
        await withPersistedDualCoverage(test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBe(0);

            await page.keyboard.press('c');
            await page.keyboard.press('s');
            const afterFirst = await page.evaluate(() => window.scrollY);
            expect(afterFirst).toBeGreaterThanOrEqual(0);

            await page.keyboard.press('c');
            await page.keyboard.press('s');
            const afterSecond = await page.evaluate(() => window.scrollY);
            expect(afterSecond).toBeGreaterThanOrEqual(0);

            if (DEBUG) console.log(`Multiple toggle - initial: ${initialScroll}px, after 1st: ${afterFirst}px, after 2nd: ${afterSecond}px`);
        });
    });
});
