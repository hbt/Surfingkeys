import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_backward_line';
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

async function invokeVisualBackwardLine(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_backward_line');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_backward_line (Playwright)', () => {
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

    test('k in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Enter visual mode and move forward first so we have room to go back
            await enterVisualMode(page);
            for (let i = 0; i < 3; i++) {
                await page.keyboard.press('j');
                await page.waitForTimeout(150);
            }

            const initialLine = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`Before k: line ${initialLine}`);
            expect(initialLine).toBeGreaterThan(1);

            await invokeVisualBackwardLine(page);
            await page.waitForTimeout(300);

            const finalLine = await getCurrentLineNumber(page);
            expect(finalLine).toBeGreaterThan(0);
            if (DEBUG) console.log(`After k: ${initialLine} → ${finalLine}`);
        });
    });

    test('k moves cursor backward one line', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);

            for (let i = 0; i < 5; i++) {
                await page.keyboard.press('j');
                await page.waitForTimeout(150);
            }

            const before = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`Before k: line ${before}`);
            expect(before).toBeGreaterThan(1);

            await invokeVisualBackwardLine(page);
            await page.waitForTimeout(300);

            const after = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`After k: line ${after}`);

            expect(after).toBeLessThan(before!);
        });
    });

    test('k moves backward (after multiple j presses)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);

            await page.keyboard.press('j');
            await page.waitForTimeout(150);
            await page.keyboard.press('j');
            await page.waitForTimeout(150);

            const afterJ = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`After 2x j: line ${afterJ}`);

            await invokeVisualBackwardLine(page);
            await page.waitForTimeout(300);

            const afterK = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`After k: line ${afterK}`);
            expect(afterK).toBeLessThan(afterJ!);
        });
    });
});
