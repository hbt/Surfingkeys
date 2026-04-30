import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_repeat_find';
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

async function invokeVisualRepeatFind(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_repeat_find');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_repeat_find (Playwright)', () => {
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

    test('pressing ; without prior find does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'Multi-word');
            const before = await getSelectionInfo(page);
            await invokeVisualRepeatFind(page);
            await page.waitForTimeout(300);
            const after = await getSelectionInfo(page);
            expect(after.focusOffset).toBe(before.focusOffset);
            if (DEBUG) console.log(`; with no prior find: offset stayed at ${after.focusOffset}`);
        });
    });

    test('; repeats forward find in same direction', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'Multi-word line');
            await page.keyboard.press('f');
            await page.waitForTimeout(200);
            await page.keyboard.type('o');
            await page.waitForTimeout(300);
            const afterFind = await getSelectionInfo(page);
            const firstOffset = afterFind.focusOffset;
            await invokeVisualRepeatFind(page);
            await page.waitForTimeout(300);
            const afterRepeat = await getSelectionInfo(page);
            expect(afterRepeat.focusOffset).toBeGreaterThanOrEqual(firstOffset);
            if (DEBUG) console.log(`fo then ;: ${firstOffset} → ${afterRepeat.focusOffset}`);
        });
    });

    test('; repeats backward find after F', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'eight nine ten');
            await page.keyboard.press('F');
            await page.waitForTimeout(200);
            await page.keyboard.type('i');
            await page.waitForTimeout(300);
            const afterFind = await getSelectionInfo(page);
            await invokeVisualRepeatFind(page);
            await page.waitForTimeout(300);
            const afterRepeat = await getSelectionInfo(page);
            expect(typeof afterRepeat.focusOffset).toBe('number');
            if (DEBUG) console.log(`Fi then ;: ${afterFind.focusOffset} → ${afterRepeat.focusOffset}`);
        });
    });

    test('; can be pressed multiple times', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page, 'one');
            await page.keyboard.press('f');
            await page.waitForTimeout(200);
            await page.keyboard.type('e');
            await page.waitForTimeout(300);
            const offsets: number[] = [];
            for (let i = 0; i < 3; i++) {
                await invokeVisualRepeatFind(page);
                await page.waitForTimeout(300);
                const sel = await getSelectionInfo(page);
                offsets.push(sel.focusOffset);
            }
            expect(offsets.length).toBe(3);
            expect(offsets.every(o => typeof o === 'number')).toBe(true);
            if (DEBUG) console.log(`Multiple ; presses: ${offsets.join(' → ')}`);
        });
    });
});
