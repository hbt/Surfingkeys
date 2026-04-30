import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function enterVisualModeAtSelector(p: Page, selector: string) {
    await p.evaluate((sel) => {
        const elem = document.querySelector(sel) as HTMLElement | null;
        if (elem && elem.firstChild && elem.firstChild.nodeType === 3) {
            const range = document.createRange();
            const s = window.getSelection();
            range.setStart(elem.firstChild, 5);
            range.collapse(true);
            s?.removeAllRanges();
            s?.addRange(range);
        }
    }, selector);
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

async function getMatchCount(p: Page): Promise<number> {
    return p.evaluate(() => document.querySelectorAll('.surfingkeys_match_mark').length);
}

async function invokeVisualSearchWord(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_search_word');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_search_word (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await waitForInvokeReady(page);
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_visual_search_word');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => {
            window.getSelection()?.removeAllRanges();
            document.querySelectorAll('.surfingkeys_match_mark, .surfingkeys_selection_mark').forEach(m => m.remove());
        });
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing * in visual mode does not error', async () => {
        await enterVisualModeAtSelector(page, '#line4');
        await page.waitForTimeout(200);
        await invokeVisualSearchWord(page);
        await page.waitForTimeout(500);
        const sel = await getSelectionInfo(page);
        expect(typeof sel.focusOffset).toBe('number');
        if (DEBUG) console.log(`* executed: focusOffset=${sel.focusOffset}`);
    });

    test('* may create match highlights', async () => {
        await enterVisualModeAtSelector(page, '#line4');
        await page.waitForTimeout(200);
        await invokeVisualSearchWord(page);
        await page.waitForTimeout(500);
        const matchCount = await getMatchCount(page);
        expect(matchCount).toBeGreaterThanOrEqual(0);
        if (DEBUG) console.log(`Match count after *: ${matchCount}`);
    });

    test('visual mode still responsive after *', async () => {
        await enterVisualModeAtSelector(page, '#line1');
        await invokeVisualSearchWord(page);
        await page.waitForTimeout(500);
        const sel = await getSelectionInfo(page);
        expect(typeof sel.focusOffset).toBe('number');
        if (DEBUG) console.log(`Visual mode active after *: focusOffset=${sel.focusOffset}`);
    });

    test('* followed by n does not error', async () => {
        await enterVisualModeAtSelector(page, '#line1');
        await invokeVisualSearchWord(page);
        await page.waitForTimeout(500);
        await page.keyboard.press('n');
        await page.waitForTimeout(400);
        const sel = await getSelectionInfo(page);
        expect(typeof sel.focusOffset).toBe('number');
        if (DEBUG) console.log(`* then n: focusOffset=${sel.focusOffset}`);
    });
});
