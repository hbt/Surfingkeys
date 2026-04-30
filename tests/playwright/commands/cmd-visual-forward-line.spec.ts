import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_forward_line';
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

async function getCurrentLineNumber(p: Page): Promise<number | null> {
    return p.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || !sel.focusNode) return null;
        let node: Node | null = sel.focusNode;
        while (node && node.nodeType !== Node.ELEMENT_NODE) {
            node = node.parentNode;
        }
        while (node) {
            const el = node as Element;
            if (el.id && el.id.startsWith('line')) {
                const num = parseInt(el.id.replace('line', ''));
                return isNaN(num) ? null : num;
            }
            node = node.parentNode;
        }
        return null;
    });
}

async function invokeVisualForwardLine(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_forward_line');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_forward_line (Playwright)', () => {
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

    test('pressing j in visual mode moves cursor forward one line', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);

            const initialLine = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`Initial line after entering visual mode: ${initialLine}`);
            expect(initialLine).toBeTruthy();

            await invokeVisualForwardLine(page);
            await page.waitForTimeout(300);

            const finalLine = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`After j: line ${initialLine} → ${finalLine}`);

            expect(finalLine).toBeTruthy();
            expect(finalLine).not.toBe(initialLine);
        });
    });

    test('pressing j multiple times moves forward progressively', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);

            const startLine = await getCurrentLineNumber(page);

            await invokeVisualForwardLine(page);
            await page.waitForTimeout(300);
            const afterFirst = await getCurrentLineNumber(page);

            await invokeVisualForwardLine(page);
            await page.waitForTimeout(300);
            const afterSecond = await getCurrentLineNumber(page);

            if (DEBUG) console.log(`Progression: ${startLine} → ${afterFirst} → ${afterSecond}`);

            expect(afterFirst).toBeTruthy();
            expect(afterSecond).toBeTruthy();
            expect(afterFirst).not.toBe(startLine);
            expect(afterSecond).not.toBe(afterFirst);
        });
    });

    test('j moves cursor to a higher line number', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);

            const before = await getCurrentLineNumber(page);
            expect(before).toBeTruthy();

            await invokeVisualForwardLine(page);
            await page.waitForTimeout(300);

            const after = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`Line ${before} → ${after}`);
            expect(after).toBeGreaterThan(before!);
        });
    });
});
