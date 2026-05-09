import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_insert_exit';
const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_insert_exit (Playwright)', () => {
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

    test('cmd_insert_exit is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Focus an input to enter insert mode, then invoke exit
            await page.click('#text-input-1');
            await page.waitForTimeout(200);

            const ok = await invokeCommand(page, 'cmd_insert_exit');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);
        });
    });

    test('cmd_insert_exit blurs the active input', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.click('#text-input-1');
            await page.waitForTimeout(200);

            const focusedBefore = await page.evaluate(() => document.activeElement?.id ?? '');
            expect(focusedBefore).toBe('text-input-1');

            await invokeCommand(page, 'cmd_insert_exit');
            await page.waitForTimeout(200);

            const focusedAfter = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase() ?? '');
            if (DEBUG) console.log(`Active element after exit: ${focusedAfter}`);
            // After blur, focus should move to body or document
            expect(focusedAfter).not.toBe('input');
        });
    });
});
