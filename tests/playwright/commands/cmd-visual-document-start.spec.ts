import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_document_start';
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
            hasNode: !!sel?.focusNode,
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

async function invokeVisualDocumentStart(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_document_start');
    expect(ok).toBe(true);
}

async function waitForLineLessThan(p: Page, threshold: number, timeout = 3000): Promise<number | null> {
    try {
        await p.waitForFunction(
            (before) => {
                const sel = window.getSelection();
                if (!sel || !sel.focusNode) return false;
                let node: Node | null = sel.focusNode;
                while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
                while (node) {
                    const el = node as Element;
                    if (el.id && el.id.startsWith('line')) {
                        const num = parseInt(el.id.replace('line', ''), 10);
                        return !isNaN(num) && num < before;
                    }
                    node = node.parentNode;
                }
                return false;
            },
            threshold,
            { timeout }
        );
        return getCurrentLineNumber(p);
    } catch (e) {
        const debug = await p.evaluate(() => {
            const sel = window.getSelection();
            let line: number | null = null;
            if (sel && sel.focusNode) {
                let node: Node | null = sel.focusNode;
                while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
                while (node) {
                    const el = node as Element;
                    if (el.id && el.id.startsWith('line')) {
                        const num = parseInt(el.id.replace('line', ''), 10);
                        line = isNaN(num) ? null : num;
                        break;
                    }
                    node = node.parentNode;
                }
            }
            return {
                line,
                selectionType: sel?.type ?? 'none',
                hasFocusNode: !!sel?.focusNode,
                focusText: sel?.focusNode?.textContent?.slice(0, 50) ?? '',
                scrollY: window.scrollY,
            };
        });
        throw new Error(
            `waitForLineLessThan timeout: before=${threshold}, after=${debug.line}, selectionType=${debug.selectionType}, hasFocusNode=${debug.hasFocusNode}, scrollY=${debug.scrollY}, focusText="${debug.focusText}"`
        );
    }
}

test.describe('cmd_visual_document_start (Playwright)', () => {
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

    test('pressing gg in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await invokeVisualDocumentStart(page);
            await page.waitForTimeout(300);
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            if (DEBUG) console.log(`gg executed: focusOffset=${sel.focusOffset}`);
        });
    });

    test('gg moves cursor to an earlier line', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Move down first using j
            await enterVisualMode(page);
            for (let i = 0; i < 10; i++) {
                await page.keyboard.press('j');
                await page.waitForTimeout(100);
            }
            await page.waitForTimeout(200);
            const lineBefore = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`before line: ${lineBefore}`);

            await invokeVisualDocumentStart(page);
            const immediateAfter = await getCurrentLineNumber(page);
            if (DEBUG) console.log(`after invoke immediate line: ${immediateAfter}`);
            const lineAfter = await waitForLineLessThan(page, lineBefore!, 3000);
            expect(lineAfter).toBeLessThan(lineBefore!);
            if (DEBUG) console.log(`gg moved: line ${lineBefore} → ${lineAfter}`);
        });
    });

    test('gg moves cursor to beginning of document', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            // Move down first
            for (let i = 0; i < 5; i++) {
                await page.keyboard.press('j');
                await page.waitForTimeout(100);
            }
            const beforeLine = await getCurrentLineNumber(page);
            expect(beforeLine).toBeGreaterThan(1);

            await invokeVisualDocumentStart(page);
            const afterLine = await waitForLineLessThan(page, beforeLine!, 3000);
            if (DEBUG) console.log(`gg: line ${beforeLine} → ${afterLine}`);
            expect(afterLine).toBeLessThan(beforeLine!);
        });
    });

    test('gg is idempotent at document start', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            // First gg
            await invokeVisualDocumentStart(page);
            await page.waitForTimeout(300);
            const line1 = await getCurrentLineNumber(page);

            // Second gg
            await invokeVisualDocumentStart(page);
            await page.waitForTimeout(300);
            const line2 = await getCurrentLineNumber(page);

            expect(line1).not.toBeNull();
            expect(line2).toBe(line1);
        });
    });

    test('gg after G moves to an earlier line', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            // Go to end first
            await page.keyboard.press('G');
            await page.waitForTimeout(500);
            const lineAfterG = await getCurrentLineNumber(page);
            expect(lineAfterG).toBeGreaterThan(1);

            // Now go to start
            await invokeVisualDocumentStart(page);
            const lineAfterGG = await waitForLineLessThan(page, lineAfterG!, 3000);
            expect(lineAfterGG).toBeLessThan(lineAfterG!);
            if (DEBUG) console.log(`G (line ${lineAfterG}) then gg (line ${lineAfterGG})`);
        });
    });
});
