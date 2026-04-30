import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_line_end';
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
            focusOffset: sel?.focusOffset ?? 0,
            text: sel?.toString() ?? '',
            hasNode: !!sel?.focusNode,
        };
    });
}

async function invokeVisualLineEnd(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_line_end');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_line_end (Playwright)', () => {
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

    test('pressing $ in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await invokeVisualLineEnd(page);
            await page.waitForTimeout(300);
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`$ executed: focusOffset=${sel.focusOffset}`);
        });
    });

    test('pressing $ multiple times does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            for (let i = 0; i < 3; i++) {
                await invokeVisualLineEnd(page);
                await page.waitForTimeout(150);
            }
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            if (DEBUG) console.log(`After 3x $: focusOffset=${sel.focusOffset}`);
        });
    });

    test('$ after 0 does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await page.keyboard.press('0');
            await page.waitForTimeout(200);
            await invokeVisualLineEnd(page);
            await page.waitForTimeout(300);
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            if (DEBUG) console.log(`0 then $: focusOffset=${sel.focusOffset}`);
        });
    });

    test('$ and 0 alternating do not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            for (let i = 0; i < 2; i++) {
                await invokeVisualLineEnd(page);
                await page.waitForTimeout(150);
                await page.keyboard.press('0');
                await page.waitForTimeout(150);
            }
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
        });
    });

    test('visual mode remains accessible after pressing $', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await invokeVisualLineEnd(page);
            await page.waitForTimeout(300);
            // Verify visual mode active via j
            const before = await page.evaluate(() => {
                const sel = window.getSelection();
                let node: Node | null = sel?.focusNode ?? null;
                while (node && (node as Element).nodeType !== 1) node = node?.parentNode ?? null;
                let id = '';
                while (node) { const el = node as Element; if (el.id) { id = el.id; break; } node = node.parentNode; }
                return id;
            });
            await page.keyboard.press('j');
            await page.waitForTimeout(300);
            const after = await page.evaluate(() => {
                const sel = window.getSelection();
                let node: Node | null = sel?.focusNode ?? null;
                while (node && (node as Element).nodeType !== 1) node = node?.parentNode ?? null;
                let id = '';
                while (node) { const el = node as Element; if (el.id) { id = el.id; break; } node = node.parentNode; }
                return id;
            });
            expect(after).not.toBe(before);
            if (DEBUG) console.log(`After $ then j: ${before} → ${after}`);
        });
    });
});
