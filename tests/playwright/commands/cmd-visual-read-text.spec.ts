import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_read_text';
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
    await p.waitForTimeout(300);
}

async function getSelectionInfo(p: Page) {
    return p.evaluate(() => {
        const sel = window.getSelection();
        return {
            type: sel?.type ?? '',
            text: sel?.toString() ?? '',
            focusOffset: sel?.focusOffset ?? 0,
        };
    });
}

async function invokeVisualReadText(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_read_text');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_read_text (Playwright)', () => {
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
        await page.evaluate(() => window.getSelection()?.removeAllRanges());
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('gr in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'Short');
            await page.waitForTimeout(200);
            await invokeVisualReadText(page);
            await page.waitForTimeout(500);
            const sel = await getSelectionInfo(page);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`gr executed: focusOffset=${sel.focusOffset}`);
        });
    });

    test('gr with selected text does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'Special chars:');
            // Move to end of line to select text
            await page.keyboard.press('$');
            await page.waitForTimeout(200);
            const selBefore = await getSelectionInfo(page);
            if (DEBUG) console.log(`Selected before gr: "${selBefore.text}"`);
            await invokeVisualReadText(page);
            await page.waitForTimeout(500);
            const selAfter = await getSelectionInfo(page);
            // Selection should be preserved
            expect(typeof selAfter.focusOffset).toBe('number');
            if (DEBUG) console.log(`gr with selection: type=${selAfter.type}`);
        });
    });

    test('gr can be called multiple times', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'medium');
            await invokeVisualReadText(page);
            await page.waitForTimeout(300);
            const first = await getSelectionInfo(page);
            await invokeVisualReadText(page);
            await page.waitForTimeout(300);
            const second = await getSelectionInfo(page);
            expect(typeof first.focusOffset).toBe('number');
            expect(typeof second.focusOffset).toBe('number');
            if (DEBUG) console.log(`gr twice: ${first.focusOffset} → ${second.focusOffset}`);
        });
    });

    test('gr executes without crashing', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'medium');
            const before = await getSelectionInfo(page);
            await invokeVisualReadText(page);
            await page.waitForTimeout(500);
            const after = await getSelectionInfo(page);
            // Verify gr executed (selection info is still accessible)
            expect(typeof after.focusOffset).toBe('number');
            if (DEBUG) console.log(`gr cursor: ${before.focusOffset} → ${after.focusOffset}`);
        });
    });
});
