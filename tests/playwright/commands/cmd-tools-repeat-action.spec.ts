import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, setSkConf } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tools_repeat_action';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_tools_repeat_action (Playwright)', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_tools_repeat_action re-executes the last action', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Set lastKeys to ';e' (edit-settings) so repeat will open the settings page
            const injected = await setSkConf(page, 'lastKeys', [';e']);
            if (DEBUG) console.log(`Injected lastKeys: ${injected}`);
            expect(injected).toBe(true);

            const beforeCount = context.pages().length;

            // Wait for the new tab that ;e would open
            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });
            const ok = await invokeCommand(page, 'cmd_tools_repeat_action');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            const newPage = await newPagePromise;
            await newPage.waitForTimeout(300);

            // Should have opened a new tab (the settings page, replaying ;e)
            expect(context.pages().length).toBeGreaterThan(beforeCount);
            expect(newPage.url()).toMatch(/pages\/options\.html/);

            if (DEBUG) console.log(`Repeated action opened: ${newPage.url()}`);
            await newPage.close();
        });
    });
});
