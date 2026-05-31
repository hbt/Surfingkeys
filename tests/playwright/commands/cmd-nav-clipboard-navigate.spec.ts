import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const SUITE_LABEL = 'cmd_nav_clipboard_navigate';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_nav_clipboard_navigate (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'gv', 'cmd_nav_clipboard_navigate');
    });

    test('gv navigates current tab to clipboard URL', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const targetUrl = `${FIXTURE_BASE}/form-test.html`;

            // Write target URL to clipboard
            await page.evaluate((url: string) => navigator.clipboard.writeText(url), targetUrl);
            await page.waitForTimeout(200);

            // Clear any selection
            await page.evaluate(() => window.getSelection()?.removeAllRanges());

            // Press g then v
            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('v');

            // Poll until URL changes to the clipboard URL
            let navigated = false;
            for (let i = 0; i < 30; i++) {
                await page.waitForTimeout(200);
                const currentUrl = page.url();
                if (currentUrl.includes('form-test.html')) {
                    navigated = true;
                    break;
                }
            }

            if (DEBUG) console.log(`gv navigated: ${page.url()}`);
            expect(navigated).toBe(true);
        });
    });
});
