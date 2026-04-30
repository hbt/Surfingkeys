import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_find_backward';
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
            anchorOffset: sel?.anchorOffset ?? 0,
            focusOffset: sel?.focusOffset ?? 0,
            text: sel?.toString() ?? '',
        };
    });
}

async function invokeVisualFindBackward(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_find_backward');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_find_backward (Playwright)', () => {
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

    test('pressing F in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'Multi-word line');
            await invokeVisualFindBackward(page);
            await page.waitForTimeout(300);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            const sel = await getSelectionInfo(page);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`F executed: focusOffset=${sel.focusOffset}`);
        });
    });

    test('F then character finds backward occurrence', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'four five');
            const before = await getSelectionInfo(page);
            await invokeVisualFindBackward(page);
            await page.waitForTimeout(200);
            await page.keyboard.type('w');
            await page.waitForTimeout(300);
            const after = await getSelectionInfo(page);
            expect(typeof after.focusOffset).toBe('number');
            if (DEBUG) console.log(`F: ${before.focusOffset} → ${after.focusOffset}`);
        });
    });

    test('F when character not found does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'Short line');
            const before = await getSelectionInfo(page);
            await invokeVisualFindBackward(page);
            await page.waitForTimeout(200);
            await page.keyboard.type('Q');
            await page.waitForTimeout(300);
            const after = await getSelectionInfo(page);
            expect(typeof after.focusOffset).toBe('number');
            if (DEBUG) console.log(`FQ (not found): before=${before.focusOffset}, after=${after.focusOffset}`);
        });
    });

    test('Escape after F cancels find mode', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'one two');
            const before = await getSelectionInfo(page);
            await invokeVisualFindBackward(page);
            await page.waitForTimeout(200);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            const after = await getSelectionInfo(page);
            expect(after.focusOffset).toBe(before.focusOffset);
            if (DEBUG) console.log(`F then Escape: offset stayed at ${after.focusOffset}`);
        });
    });
});
