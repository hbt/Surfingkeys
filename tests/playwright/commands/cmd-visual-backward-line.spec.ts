import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-lines-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

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
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await waitForInvokeReady(page);
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_visual_backward_line');
        await cov?.close();
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

    test('k moves cursor backward one line', async () => {
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

    test('k moves backward (after multiple j presses)', async () => {
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
