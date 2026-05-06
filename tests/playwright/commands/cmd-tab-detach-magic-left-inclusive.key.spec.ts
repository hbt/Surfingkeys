import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_detach_magic_left_inclusive_key';
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

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a],
            bubbles: true,
            composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

async function getAllWindowsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.windows.getAll({ populate: true }, (windows: any[]) => resolve(windows));
        });
    });
}

test.describe('cmd_tab_detach_magic_left_inclusive_key (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        const p = await context.newPage();
        await p.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    async function closeAllExcept(keepPage: import('@playwright/test').Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('cmd_tab_detach_magic_left_inclusive detaches current + left tabs via tdQ', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/via_tdQ`)}`;
                const left0 = await context.newPage();
                await left0.goto(FIXTURE_URL, { waitUntil: 'load' });
                await closeAllExcept(left0);

                const left1 = await context.newPage();
                await left1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await left1.waitForTimeout(200);

                const anchor = await context.newPage();
                await anchor.goto(anchorUrl, { waitUntil: 'load' });
                await anchor.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(anchorUrl);

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', 'tdQ', 'cmd_tab_detach_magic_left_inclusive');

                const beforeWindows = await getAllWindowsViaSW(context);

                await covBg?.snapshot();
                await covContent?.snapshot();

                await anchor.keyboard.press('t');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('d');
                await anchor.waitForTimeout(50);
                await anchor.keyboard.press('Q');

                await anchor.waitForTimeout(1000);

                const afterWindows = await getAllWindowsViaSW(context);
                const movedWindow = afterWindows.find((w: any) =>
                    w.tabs.some((t: any) => t.url.includes(anchorUrl)),
                );
                expect(movedWindow).toBeDefined();
                expect(movedWindow!.tabs.length).toBe(3);
                expect(afterWindows.length).toBeLessThanOrEqual(beforeWindows.length + 1);

                if (DEBUG) console.log(`cmd_tab_detach_magic_left_inclusive_key: windows ${beforeWindows.length} → ${afterWindows.length}`);

                const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
                const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${label}/content`) ?? null;
                assertBasicCoverage(bgPath, contentPath);
                await covContent?.close();
            },
        );
    });
});
