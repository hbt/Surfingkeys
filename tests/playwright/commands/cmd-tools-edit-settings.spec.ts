import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tools_edit_settings';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_tools_edit_settings (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', ';e', 'cmd_tools_edit_settings');
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_tools_edit_settings opens options page in new tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const beforeCount = context.pages().length;

            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });
            const ok = await invokeCommand(page, 'cmd_tools_edit_settings');
            expect(ok).toBe(true);

            const newPage = await newPagePromise;
            await newPage.waitForTimeout(300);

            expect(context.pages().length).toBeGreaterThan(beforeCount);
            expect(newPage.url()).toMatch(/pages\/options\.html/);

            if (DEBUG) console.log(`Settings page opened: ${newPage.url()}`);

            await newPage.close();
        });
    });

    test('cmd_tools_edit_settings does not close the original tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const originalUrl = page.url();

            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });
            await invokeCommand(page, 'cmd_tools_edit_settings');
            const newPage = await newPagePromise;
            await newPage.waitForTimeout(300);

            // Original page still exists and has the same URL
            expect(page.isClosed()).toBe(false);
            expect(page.url()).toBe(originalUrl);

            await newPage.close();
        });
    });
});
