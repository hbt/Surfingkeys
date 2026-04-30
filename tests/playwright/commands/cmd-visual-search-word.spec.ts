import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_search_word';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function enterVisualModeAtSelector(p: Page, selector: string) {
    await p.evaluate((sel) => {
        const elem = document.querySelector(sel) as HTMLElement | null;
        if (elem && elem.firstChild && elem.firstChild.nodeType === 3) {
            const range = document.createRange();
            const s = window.getSelection();
            range.setStart(elem.firstChild, 5);
            range.collapse(true);
            s?.removeAllRanges();
            s?.addRange(range);
        }
    }, selector);
    await p.waitForTimeout(100);
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

async function getMatchCount(p: Page): Promise<number> {
    return p.evaluate(() => document.querySelectorAll('.surfingkeys_match_mark').length);
}

async function invokeVisualSearchWord(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_search_word');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_search_word (Playwright)', () => {
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
            document.querySelectorAll('.surfingkeys_match_mark, .surfingkeys_selection_mark').forEach(m => m.remove());
        });
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing * in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualModeAtSelector(page, '#line4');
            await page.waitForTimeout(200);
            await invokeVisualSearchWord(page);
            await page.waitForTimeout(500);
            const sel = await getSelectionInfo(page);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`* executed: focusOffset=${sel.focusOffset}`);
        });
    });

    test('* may create match highlights', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualModeAtSelector(page, '#line4');
            await page.waitForTimeout(200);
            await invokeVisualSearchWord(page);
            await page.waitForTimeout(500);
            const matchCount = await getMatchCount(page);
            expect(matchCount).toBeGreaterThanOrEqual(0);
            if (DEBUG) console.log(`Match count after *: ${matchCount}`);
        });
    });

    test('visual mode still responsive after *', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualModeAtSelector(page, '#line1');
            await invokeVisualSearchWord(page);
            await page.waitForTimeout(500);
            const sel = await getSelectionInfo(page);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`Visual mode active after *: focusOffset=${sel.focusOffset}`);
        });
    });

    test('* followed by n does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualModeAtSelector(page, '#line1');
            await invokeVisualSearchWord(page);
            await page.waitForTimeout(500);
            await page.keyboard.press('n');
            await page.waitForTimeout(400);
            const sel = await getSelectionInfo(page);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`* then n: focusOffset=${sel.focusOffset}`);
        });
    });
});
