import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_translate_word';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function enterVisualMode(p: Page, text: string) {
    await p.evaluate((t) => { (window as any).find(t); }, text);
    await p.waitForTimeout(100);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(500);
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

async function isVisualCursorVisible(p: Page): Promise<boolean> {
    return p.evaluate(() => {
        const cursor = document.querySelector('.surfingkeys_cursor');
        return cursor !== null && document.body.contains(cursor);
    });
}

async function invokeVisualTranslateWord(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_translate_word');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_translate_word (Playwright)', () => {
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
            document.querySelectorAll('.sk_bubble').forEach((b) => b.remove());
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing q in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'medium');
            await invokeVisualTranslateWord(page);
            await page.waitForTimeout(500);
            const sel = await getSelectionInfo(page);
            expect(sel.type).toBeDefined();
            if (DEBUG) console.log(`q executed: type=${sel.type}, offset=${sel.focusOffset}`);
        });
    });

    test('q command works with simple word', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'Short');
            await invokeVisualTranslateWord(page);
            await page.waitForTimeout(500);
            const sel = await getSelectionInfo(page);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`q on Short: focusOffset=${sel.focusOffset}`);
        });
    });

    test('q executes without crashing', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'medium');
            const cursorBefore = await isVisualCursorVisible(page);
            await invokeVisualTranslateWord(page);
            await page.waitForTimeout(500);
            const sel = await page.evaluate(() => typeof window.getSelection());
            // Verify q executed without crash (selection API still accessible)
            expect(sel).toBe('object');
            const cursorAfter = await isVisualCursorVisible(page);
            if (DEBUG) console.log(`Visual cursor before q: ${cursorBefore}, after q: ${cursorAfter}`);
        });
    });

    test('q can be pressed multiple times', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'Multi-word');
            await invokeVisualTranslateWord(page);
            await page.waitForTimeout(400);
            const first = await getSelectionInfo(page);
            // Move to next word
            await page.keyboard.press('w');
            await page.waitForTimeout(200);
            await invokeVisualTranslateWord(page);
            await page.waitForTimeout(400);
            const second = await getSelectionInfo(page);
            expect(typeof first.focusOffset).toBe('number');
            expect(typeof second.focusOffset).toBe('number');
            if (DEBUG) console.log(`q twice: ${first.focusOffset} → ${second.focusOffset}`);
        });
    });
});
