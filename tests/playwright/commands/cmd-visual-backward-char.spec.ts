import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_backward_char';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-lines-test.html`;
const KEY = 'h';
const UNIQUE_ID = 'cmd_visual_backward_char';
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

async function invokeVisualBackwardChar(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_backward_char');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_backward_char (Playwright)', () => {
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
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
        await callSKApi(page, 'mapcmdkey', 'v', 'cmd_visual_toggle');
        await callSKApi(page, 'mapcmdkey', 'l', 'cmd_visual_forward_char');
        await callSKApi(page, 'mapcmdkey', 'j', 'cmd_visual_forward_line');
        await page.evaluate(() => {
            window.getSelection()?.removeAllRanges();
            window.scrollTo(0, 0);
        });
        await page.waitForTimeout(200);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing h in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await invokeVisualBackwardChar(page);
            await page.waitForTimeout(300);
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            expect(typeof sel.focusOffset).toBe('number');
            if (DEBUG) console.log(`h executed: focusOffset=${sel.focusOffset}`);
        });
    });

    test('pressing h multiple times does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            for (let i = 0; i < 5; i++) {
                await invokeVisualBackwardChar(page);
                await page.waitForTimeout(100);
            }
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            if (DEBUG) console.log(`After 5x h: focusOffset=${sel.focusOffset}`);
        });
    });

    test('h at line start does not crash', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await page.keyboard.press('0');
            await page.waitForTimeout(200);
            await invokeVisualBackwardChar(page);
            await page.waitForTimeout(300);
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
        });
    });

    test('h after l does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            for (let i = 0; i < 3; i++) {
                await page.keyboard.press('l');
                await page.waitForTimeout(100);
            }
            await invokeVisualBackwardChar(page);
            await page.waitForTimeout(300);
            const sel = await getSelectionInfo(page);
            expect(sel.hasNode).toBe(true);
            if (DEBUG) console.log(`h after l: type=${sel.type}`);
        });
    });

    test('visual mode remains accessible after pressing h', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualMode(page);
            await invokeVisualBackwardChar(page);
            await page.waitForTimeout(300);
            // Verify visual mode still active via j
            const before = await page.evaluate(() => {
                const sel = window.getSelection();
                let node: Node | null = sel?.focusNode ?? null;
                while (node && (node as Element).nodeType !== 1) node = node?.parentNode ?? null;
                let id = '';
                while (node) { const el = node as Element; if (el.id) { id = el.id; break; } node = node.parentNode; }
                return id;
            });
            await invokeCommand(page, 'cmd_visual_forward_line');
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
            if (DEBUG) console.log(`After h then j: ${before} → ${after}`);
        });
    });
});
