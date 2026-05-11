import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_insert_delete_word_forward';
const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_insert_delete_word_forward (Playwright)', () => {
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

    test('cmd_insert_delete_word_forward deletes next word in input', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Fill input with known value and position cursor at start
            const input = page.locator('#text-input-2');
            await input.fill('hello world test');
            await input.click();
            await input.evaluate((el: HTMLInputElement) => {
                el.selectionStart = el.selectionEnd = 0;
            });
            await page.waitForTimeout(100);

            const valueBefore = await input.inputValue();
            const ok = await invokeCommand(page, 'cmd_insert_delete_word_forward');
            if (DEBUG) console.log(`result: ${ok}, before: "${valueBefore}"`);
            expect(ok).toBe(true);

            const valueAfter = await input.inputValue();
            if (DEBUG) console.log(`after: "${valueAfter}"`);
            expect(valueAfter.length).toBeLessThan(valueBefore.length);
        });
    });
});
