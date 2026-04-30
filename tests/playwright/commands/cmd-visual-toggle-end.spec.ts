import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_toggle_end';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-lines-test.html`;
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
            hasNode: !!sel?.focusNode,
        };
    });
}

async function invokeVisualToggleEnd(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_toggle_end');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_toggle_end (Playwright)', () => {
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
        await page.evaluate(() => {
            window.getSelection()?.removeAllRanges();
            window.scrollTo(0, 0);
        });
        await page.waitForTimeout(200);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing o in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await invokeVisualToggleEnd(page);
            await page.waitForTimeout(300);
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`o executed: focusOffset=${sel.focusOffset}`);
        });
    });

    test('o toggles anchor and focus after j creates range', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            // Move down to create range selection
            for (let i = 0; i < 3; i++) {
                await page.keyboard.press('j');
                await page.waitForTimeout(150);
            }
            await page.waitForTimeout(200);
            const before = await getSelectionInfo(page);
            if (DEBUG) console.log(`Before o: type=${before.type}, anchor=${before.anchorOffset}, focus=${before.focusOffset}`);

            await invokeVisualToggleEnd(page);
            await page.waitForTimeout(300);
            const after = await getSelectionInfo(page);
            if (DEBUG) console.log(`After o: type=${after.type}, anchor=${after.anchorOffset}, focus=${after.focusOffset}`);

            // After toggle, anchor and focus should swap
            expect(after.anchorOffset).toBe(before.focusOffset);
            expect(after.focusOffset).toBe(before.anchorOffset);
        });
    });

    test('o preserves selected text', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            // Create selection with j
            for (let i = 0; i < 2; i++) {
                await page.keyboard.press('j');
                await page.waitForTimeout(150);
            }
            await page.waitForTimeout(200);
            const before = await getSelectionInfo(page);
            const textBefore = before.text;

            await invokeVisualToggleEnd(page);
            await page.waitForTimeout(300);
            const after = await getSelectionInfo(page);

            expect(after.text).toBe(textBefore);
            if (DEBUG) console.log(`o preserved text (length=${textBefore.length})`);
        });
    });

    test('o toggled twice returns to original', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            for (let i = 0; i < 2; i++) {
                await page.keyboard.press('j');
                await page.waitForTimeout(150);
            }
            await page.waitForTimeout(200);
            const initial = await getSelectionInfo(page);

            await invokeVisualToggleEnd(page);
            await page.waitForTimeout(300);
            await invokeVisualToggleEnd(page);
            await page.waitForTimeout(300);
            const back = await getSelectionInfo(page);

            expect(back.anchorOffset).toBe(initial.anchorOffset);
            expect(back.focusOffset).toBe(initial.focusOffset);
            if (DEBUG) console.log(`o x2 = original: anchor=${initial.anchorOffset}, focus=${initial.focusOffset}`);
        });
    });

    test('o in caret mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            // Don't move — stay in caret mode
            await invokeVisualToggleEnd(page);
            await page.waitForTimeout(300);
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            if (DEBUG) console.log(`o in caret: type=${sel.type}`);
        });
    });
});
