import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_insert_delete_word_backward';
const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

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

test.describe('cmd_insert_delete_word_backward (Playwright)', () => {
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
        await callSKApi(page, 'mapcmdkey', '<Alt-w>', 'cmd_insert_delete_word_backward');
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_insert_delete_word_backward deletes last word in input', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Position cursor at end of pre-filled input ("Sample text")
            await page.click('#text-input-1');
            const input = page.locator('#text-input-1');
            await input.evaluate((el: HTMLInputElement) => {
                el.selectionStart = el.selectionEnd = el.value.length;
            });
            await page.waitForTimeout(100);

            const valueBefore = await input.inputValue();
            const ok = await invokeCommand(page, 'cmd_insert_delete_word_backward');
            if (DEBUG) console.log(`result: ${ok}, before: "${valueBefore}"`);
            expect(ok).toBe(true);

            const valueAfter = await input.inputValue();
            if (DEBUG) console.log(`after: "${valueAfter}"`);
            expect(valueAfter.length).toBeLessThan(valueBefore.length);
        });
    });
});
