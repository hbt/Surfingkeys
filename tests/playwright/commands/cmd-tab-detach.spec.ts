import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_detach';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

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

test.describe('cmd_tab_detach (Playwright)', () => {
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

    test('cmd_tab_detach creates a new window', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Setup: 1 window with 3 tabs
            const tab1 = await context.newPage();
            await tab1.goto(FIXTURE_URL, { waitUntil: 'load' });
            await closeAllExcept(tab1);

            const tab2 = await context.newPage();
            await tab2.goto(FIXTURE_URL, { waitUntil: 'load' });
            await tab2.waitForTimeout(200);

            const tab3 = await context.newPage();
            await tab3.goto(FIXTURE_URL, { waitUntil: 'load' });
            await tab3.waitForTimeout(200);

            await tab1.bringToFront();
            await tab1.waitForTimeout(300);

            const beforeWindows = await getAllWindowsViaSW(context);
            const beforeCount = beforeWindows.length;
            const originalWindowId = beforeWindows[0].id;

            await invokeCommand(tab1, 'cmd_tab_detach');
            await waitForWindowCount(context, beforeCount + 1);

            const afterWindows = await getAllWindowsViaSW(context);
            expect(afterWindows.length).toBe(beforeCount + 1);

            const originalWindow = afterWindows.find((w: any) => w.id === originalWindowId);
            const newWindow = afterWindows.find((w: any) => w.id !== originalWindowId);

            expect(originalWindow).toBeDefined();
            expect(newWindow).toBeDefined();
            expect(originalWindow!.tabs.length).toBe(2);
            expect(newWindow!.tabs.length).toBe(1);

            if (DEBUG) console.log(`cmd_tab_detach: windows ${beforeCount} → ${afterWindows.length}`);

            // Cleanup: remove the new window
            const sw = context.serviceWorkers()[0];
            await sw.evaluate((id: number) => {
                return new Promise<void>((resolve) => {
                    chrome.windows.remove(id, () => resolve());
                });
            }, newWindow!.id).catch(() => {});
            await new Promise(r => setTimeout(r, 300));
        });
    });
});
