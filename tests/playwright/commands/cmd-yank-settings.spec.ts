import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_yank_settings';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_yank_settings (Playwright)', () => {
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

    test('cmd_yank_settings copies settings JSON to clipboard', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const ok = await invokeCommand(page, 'cmd_yank_settings');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            // Wait for async RUNTIME('getSettings') response to write to clipboard
            await page.waitForTimeout(1000);
            const clipText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
            if (DEBUG) console.log(`Clipboard: ${clipText.slice(0, 100)}`);

            // Should be valid JSON containing settings
            let parsed: unknown;
            expect(() => { parsed = JSON.parse(clipText); }).not.toThrow();
            expect(typeof parsed).toBe('object');
        });
    });
});
