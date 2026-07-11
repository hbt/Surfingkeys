import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

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

async function waitForScrollY(p: Page, target: number, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await p.evaluate(() => window.scrollY) === target) return;
        await p.waitForTimeout(50);
    }
    throw new Error(`waitForScrollY(${target}): timed out after ${timeoutMs}ms`);
}

const SUITE_LABEL = 'cmd_marks_jump';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const FIXTURE_URL_2 = `${FIXTURE_BASE}/input-test.html`;
const LOCAL_MARKS_KEY = 'surfingkeys.localMarks';

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_marks_jump (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(100);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate((key) => localStorage.removeItem(key), LOCAL_MARKS_KEY);
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', "'", 'cmd_marks_jump');
        await callSKApi(page, 'mapcmdkey', 'm', 'cmd_marks_add');
    });

    test('cmd_marks_jump is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // normal.jumpVIMark — shows omnibar to select a saved mark
            await page.mouse.click(100, 100);
            const ok = await invokeCommand(page, 'cmd_marks_jump');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);
        });
    });

    test('lowercase mark restores scroll position on the same page', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.evaluate(() => window.scrollTo({ top: 400, left: 0, behavior: 'instant' }));
            await waitForScrollY(page, 400);

            await page.keyboard.press('m');
            await page.waitForTimeout(100);
            await page.keyboard.press('a');
            await page.waitForTimeout(200);

            await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
            await waitForScrollY(page, 0);

            await page.keyboard.press("'");
            await page.waitForTimeout(100);
            await page.keyboard.press('a');

            await waitForScrollY(page, 400);
        });
    });

    test('lowercase mark set on one page does not apply after navigating to another page', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.evaluate(() => window.scrollTo(0, 400));
            await page.waitForTimeout(100);

            await page.keyboard.press('m');
            await page.waitForTimeout(100);
            await page.keyboard.press('a');
            await page.waitForTimeout(200);

            await page.goto(FIXTURE_URL_2, { waitUntil: 'load' });
            await page.waitForTimeout(500);
            await callSKApi(page, 'unmapAllExcept', []);
            await callSKApi(page, 'mapcmdkey', "'", 'cmd_marks_jump');

            const before = page.url();
            const pageCountBefore = context.pages().length;
            await page.keyboard.press("'");
            await page.waitForTimeout(100);
            await page.keyboard.press('a');
            await page.waitForTimeout(500);

            // must not navigate the current page, and must not open a new tab either
            expect(page.url()).toBe(before);
            expect(context.pages().length).toBe(pageCountBefore);

            // restore for subsequent tests
            await page.goto(FIXTURE_URL, { waitUntil: 'load' });
            await page.waitForTimeout(500);
        });
    });
});
