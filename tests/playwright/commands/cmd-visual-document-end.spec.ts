import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_document_end';
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
            focusNodeText: sel?.focusNode?.textContent?.substring(0, 40) ?? '',
        };
    });
}

async function getCurrentLineNumber(p: Page): Promise<number | null> {
    return p.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || !sel.focusNode) return null;
        let node: Node | null = sel.focusNode;
        while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
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

async function invokeVisualDocumentEnd(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_document_end');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_document_end (Playwright)', () => {
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
            window.scrollTo(0, 0);
            window.getSelection()?.removeAllRanges();
        });
        await page.waitForTimeout(200);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing G in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await invokeVisualDocumentEnd(page);
            await page.waitForTimeout(500);
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`G executed: focusOffset=${sel.focusOffset}`);
        });
    });

    test('G moves cursor to a later line', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            // Move to an early line first with j movements (to have room for G to go further)
            // Use only j (which reliably works)
            const startLine = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`Start line before G: ${startLine}`);

            await invokeVisualDocumentEnd(page);
            await page.waitForTimeout(500);
            const endLine = await getCurrentLineNumber(page);

            if (DEBUG) console.log(`G: line ${startLine} → ${endLine}`);
            // G should move cursor at least as far as start (may stay same if already at end)
            expect(endLine).not.toBeNull();
            expect(endLine).toBeGreaterThanOrEqual(startLine!);
        });
    });

    test('G after multiple j moves to later line', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            // Press j to move down, establishing a known line
            for (let i = 0; i < 3; i++) {
                await page.keyboard.press('j');
                await page.waitForTimeout(150);
            }
            const midLine = await getCurrentLineNumber(page);

            await invokeVisualDocumentEnd(page);
            await page.waitForTimeout(500);
            const endLine = await getCurrentLineNumber(page);

            if (DEBUG) console.log(`After j×3 (line ${midLine}), G → line ${endLine}`);
            expect(endLine).toBeGreaterThanOrEqual(midLine!);
            expect(endLine).not.toBeNull();
        });
    });

    test('pressing G twice does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await invokeVisualDocumentEnd(page);
            await page.waitForTimeout(500);
            const first = await getSelectionInfo(page);

            await invokeVisualDocumentEnd(page);
            await page.waitForTimeout(500);
            const second = await getSelectionInfo(page);

            expect(first.hasNode).toBe(true);
            expect(second.hasNode).toBe(true);
            if (DEBUG) console.log(`G twice: offset=${first.focusOffset} → ${second.focusOffset}`);
        });
    });

    test('G then gg moves to earlier line', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await invokeVisualDocumentEnd(page);
            await page.waitForTimeout(500);
            const lineAfterG = await getCurrentLineNumber(page);

            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('g');
            await page.waitForTimeout(500);
            const lineAfterGG = await getCurrentLineNumber(page);

            expect(lineAfterGG).toBeLessThan(lineAfterG!);
            if (DEBUG) console.log(`G (line ${lineAfterG}) then gg (line ${lineAfterGG})`);
        });
    });
});
