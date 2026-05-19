import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_nav_new_window';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function callSKApi(p: Page, fn: string, ...args: unknown[]) {
    await p.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a],
            bubbles: true,
            composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await p.waitForTimeout(100);
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

async function waitForWindowCount(ctx: BrowserContext, expected: number, maxWaitMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const windows = await getAllWindowsViaSW(ctx);
        if (windows.length >= expected) return;
        await new Promise(r => setTimeout(r, 100));
    }
}

test.describe('cmd_nav_new_window (Playwright)', () => {
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

    test('nn opens a new browser window', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.bringToFront();
                await page.waitForTimeout(200);

                // Install the user-config mapping (mirrors ~/.surfingkeys-2026.js)
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', 'nn', 'cmd_nav_new_window');

                const beforeWindows = await getAllWindowsViaSW(context);
                const beforeCount = beforeWindows.length;
                if (DEBUG) console.log(`nn: windows before = ${beforeCount}`);

                // Press nn
                await page.keyboard.press('n');
                await page.waitForTimeout(50);
                await page.keyboard.press('n');

                await waitForWindowCount(context, beforeCount + 1);

                const afterWindows = await getAllWindowsViaSW(context);
                if (DEBUG) console.log(`nn: windows after = ${afterWindows.length}`);
                expect(afterWindows.length).toBe(beforeCount + 1);

                // Cleanup: close the new window
                const newWin = afterWindows.find(
                    (w: any) => !beforeWindows.some((bw: any) => bw.id === w.id),
                );
                if (newWin) {
                    const sw = context.serviceWorkers()[0];
                    await sw.evaluate((id: number) => {
                        return new Promise<void>((resolve) => {
                            chrome.windows.remove(id, () => resolve());
                        });
                    }, newWin.id).catch(() => {});
                    await page.waitForTimeout(300);
                }
            },
        );
    });
});
