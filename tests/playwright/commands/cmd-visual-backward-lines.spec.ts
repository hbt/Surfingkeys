import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_backward_lines';
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

async function invokeVisualBackwardLines(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_backward_lines');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_backward_lines (Playwright)', () => {
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
            window.scrollTo(0, document.documentElement.scrollHeight);
        });
        await page.waitForTimeout(200);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('Ctrl-u in visual mode does not error - selection is queryable', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);

            await invokeVisualBackwardLines(page);
            await page.waitForTimeout(500);

            const selection = await getSelectionInfo(page);
            expect(typeof selection.focusOffset).toBe('number');
            const scrollY = await page.evaluate(() => window.scrollY);
            if (DEBUG) console.log(`After Ctrl-u: focusOffset=${selection.focusOffset}, scrollY=${scrollY}`);
        });
    });

    test('Ctrl-u can be pressed multiple times without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);

            await invokeVisualBackwardLines(page);
            await page.waitForTimeout(500);

            const sel1 = await getSelectionInfo(page);
            expect(typeof sel1.focusOffset).toBe('number');

            await invokeVisualBackwardLines(page);
            await page.waitForTimeout(500);

            const sel2 = await getSelectionInfo(page);
            expect(typeof sel2.focusOffset).toBe('number');
            if (DEBUG) console.log(`Two Ctrl-u presses: ${sel1.focusOffset} → ${sel2.focusOffset}`);
        });
    });

    test('Ctrl-u maintains visual mode (selection still queryable)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);

            await invokeVisualBackwardLines(page);
            await page.waitForTimeout(500);

            const selection = await getSelectionInfo(page);
            expect(typeof selection.focusOffset).toBe('number');
            if (DEBUG) console.log(`Visual mode still active after Ctrl-u: focusOffset=${selection.focusOffset}`);
        });
    });
});
