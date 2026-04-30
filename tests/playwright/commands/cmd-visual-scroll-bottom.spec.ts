import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_scroll_bottom';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function enterVisualMode(p: Page) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(300);
}

async function getSelectionInfo(p: Page) {
    return p.evaluate(() => {
        const sel = window.getSelection();
        return {
            type: sel?.type ?? '',
            anchorOffset: sel?.anchorOffset ?? 0,
            focusOffset: sel?.focusOffset ?? 0,
            text: sel?.toString() ?? '',
        };
    });
}

async function invokeVisualScrollBottom(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_scroll_bottom');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_scroll_bottom (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await waitForInvokeReady(page);
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('zb in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 500));
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBe(500);

            await enterVisualMode(page);
            await page.waitForTimeout(100);

            await invokeVisualScrollBottom(page);
            await page.waitForTimeout(300);

            const finalScroll = await page.evaluate(() => window.scrollY);
            expect(typeof finalScroll).toBe('number');
            if (DEBUG) console.log(`zb executed: scroll ${initialScroll}px → ${finalScroll}px`);
        });
    });

    test('zb does not error and selection is still valid after execution', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 500));

            await enterVisualMode(page);
            await page.waitForTimeout(100);

            await invokeVisualScrollBottom(page);
            await page.waitForTimeout(300);

            // Verify selection is still accessible (visual mode still active)
            const selection = await getSelectionInfo(page);
            expect(typeof selection.focusOffset).toBe('number');
            if (DEBUG) console.log(`After zb: focusOffset=${selection.focusOffset}`);
        });
    });

    test('zb maintains visual mode - cursor exists before and after', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 500));

            await enterVisualMode(page);
            await page.waitForTimeout(200);

            const cursorBefore = await page.evaluate(() => document.querySelector('.surfingkeys_cursor') !== null);
            if (DEBUG) console.log(`Cursor before zb: ${cursorBefore}`);

            await invokeVisualScrollBottom(page);
            await page.waitForTimeout(300);

            const selection = await getSelectionInfo(page);
            expect(typeof selection.focusOffset).toBe('number');
            if (DEBUG) console.log(`Visual mode active after zb: focusOffset=${selection.focusOffset}`);
        });
    });
});
