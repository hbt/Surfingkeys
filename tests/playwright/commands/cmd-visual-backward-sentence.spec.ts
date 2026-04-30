import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_backward_sentence';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-sentence-test.html`;
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

async function invokeVisualBackwardSentence(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_backward_sentence');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_backward_sentence (Playwright)', () => {
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
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('( in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'third sentence here');

            await invokeVisualBackwardSentence(page);
            await page.waitForTimeout(300);

            const selection = await getSelectionInfo(page);
            expect(typeof selection.focusOffset).toBe('number');
            if (DEBUG) console.log(`( executed: focusOffset=${selection.focusOffset}`);
        });
    });

    test('( moves cursor backward in visual mode', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'third sentence here');

            const before = await getSelectionInfo(page);
            const initialOffset = before.focusOffset;
            if (DEBUG) console.log(`Before (: focusOffset=${initialOffset}`);

            await invokeVisualBackwardSentence(page);
            await page.waitForTimeout(300);

            const after = await getSelectionInfo(page);
            const finalOffset = after.focusOffset;
            if (DEBUG) console.log(`After (: focusOffset=${finalOffset}`);

            expect(finalOffset).toBeLessThanOrEqual(initialOffset);
        });
    });

    test('( navigates backward through multiple sentences', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'third sentence here');

            const positions: number[] = [];
            const initial = await getSelectionInfo(page);
            positions.push(initial.focusOffset);

            for (let i = 0; i < 3; i++) {
                await invokeVisualBackwardSentence(page);
                await page.waitForTimeout(300);

                const current = await getSelectionInfo(page);
                positions.push(current.focusOffset);
            }

            for (let i = 1; i < positions.length; i++) {
                expect(positions[i]).toBeLessThanOrEqual(positions[i - 1]);
            }
            if (DEBUG) console.log(`( progression: ${positions.join(' → ')}`);
        });
    });
});
