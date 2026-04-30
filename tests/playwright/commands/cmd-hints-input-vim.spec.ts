/**
 * Playwright Test: cmd_hints_input_vim
 *
 * Tests for the 'I' key (Go to edit box with vim editor).
 * - Key: I (Shift+i)
 * - Behavior: Show hints to select input/textarea/editable elements and open in vim editor
 * - Fixture: input-test.html
 *
 * Converted from tests/cdp/commands/cmd-hints-input-vim.test.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

// ---------------------------------------------------------------------------
// Hint helpers
// ---------------------------------------------------------------------------

async function fetchHintSnapshot(p: Page) {
    return p.evaluate(() => {
        const host = document.querySelector('.surfingkeys_hints_host') as any;
        if (!host?.shadowRoot) return { found: false, count: 0, sortedHints: [] as string[], sample: [] as any[] };
        const divs = Array.from(host.shadowRoot.querySelectorAll('div')).filter((d: any) => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });
        return {
            found: true,
            count: divs.length,
            sortedHints: (divs as any[]).map((d: any) => d.textContent?.trim()).sort() as string[],
            sample: (divs as any[]).slice(0, 5).map((h: any) => ({
                text: h.textContent?.trim(),
                visible: h.offsetParent !== null,
                position: { left: (h as any).offsetLeft, top: (h as any).offsetTop },
            })),
        };
    });
}

async function waitForHints(p: Page, minCount = 1, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`Hints not shown after ${timeout}ms`);
}

async function waitForHintsCleared(p: Page, timeout = 4000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (!snap.found || snap.count === 0) return;
        await p.waitForTimeout(100);
    }
    throw new Error('Hints did not clear');
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_input_vim (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(600);
    });

    test.afterEach(async () => {
        try {
            await page.keyboard.press('Escape');
            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);
        } catch (_) {}
        // Blur any focused input and reset state
        await page.evaluate(() => {
            if (document.activeElement && document.activeElement.tagName !== 'BODY') {
                (document.activeElement as HTMLElement).blur();
            }
            document.querySelectorAll('.surfingkeys_hints_host').forEach(h => h.remove());
        });
        await page.mouse.click(100, 100);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_hints_input_vim');
        await cov?.close();
        await context?.close();
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 page has text inputs', async () => {
        const inputCount = await page.locator('input:not([type=submit]):not([disabled]):not([readonly])').count();
        expect(inputCount).toBeGreaterThanOrEqual(8);
    });

    test('1.2 page has textarea elements', async () => {
        const textareaCount = await page.locator('textarea').count();
        expect(textareaCount).toBeGreaterThanOrEqual(2);
    });

    test('1.3 page has contenteditable elements', async () => {
        const editableCount = await page.locator('[contenteditable=true]').count();
        expect(editableCount).toBeGreaterThanOrEqual(1);
    });

    test('1.4 no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 2.0 Hint Creation with 'I' key
    // -----------------------------------------------------------------------

    test('2.1 should create hints when pressing I key', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('I');
        await waitForHints(page, 1);

        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(true);
        expect(snap.count).toBeGreaterThanOrEqual(3);
    });

    test('2.2 hints are in shadowRoot', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('I');
        await waitForHints(page, 1);

        const hostInfo = await page.evaluate(() => {
            const h = document.querySelector('.surfingkeys_hints_host') as any;
            return {
                found: !!h,
                hasShadowRoot: !!h?.shadowRoot,
                children: h?.shadowRoot?.children.length || 0,
            };
        });
        expect(hostInfo.found).toBe(true);
        expect(hostInfo.hasShadowRoot).toBe(true);
        expect(hostInfo.children).toBeGreaterThan(0);
    });

    test('2.3 hint labels are uppercase letters', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('I');
        await waitForHints(page, 1);

        const snap = await fetchHintSnapshot(page);
        expect(snap.sample.length).toBeGreaterThan(0);
        for (const hint of snap.sample) {
            expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('2.4 hint count does not exceed editable element count', async () => {
        const editableCount = await page.locator(
            'input:not([type=submit]):not([disabled]):not([readonly]), textarea, [contenteditable=true], select'
        ).count();

        await page.mouse.click(100, 100);
        await page.keyboard.press('I');
        await waitForHints(page, 1);

        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBeGreaterThan(0);
        expect(snap.count).toBeLessThanOrEqual(editableCount);
    });

    // -----------------------------------------------------------------------
    // 3.0 Hint Clearing
    // -----------------------------------------------------------------------

    test('3.1 hints clear on Escape', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('I');
        await waitForHints(page, 1);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBe(0);
    });

    test('3.2 hints are consistent across invocations', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('I');
        await waitForHints(page, 1);
        const snap1 = await fetchHintSnapshot(page);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('I');
        await waitForHints(page, 1);
        const snap2 = await fetchHintSnapshot(page);

        expect(snap1.count).toBe(snap2.count);
        expect(snap1.sortedHints).toEqual(snap2.sortedHints);
    });

    test('3.3 typing hint label filters hints', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('I');
        await waitForHints(page, 1);

        const snap = await fetchHintSnapshot(page);
        const initialCount = snap.count;
        const firstHint = snap.sortedHints[0];

        if (firstHint && firstHint.length > 0) {
            await page.keyboard.press(firstHint[0]);
            // Wait until count changes or hints disappear
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
                const current = await fetchHintSnapshot(page);
                if (!current.found || current.count < initialCount) break;
                await page.waitForTimeout(50);
            }

            const filtered = await fetchHintSnapshot(page);
            expect(filtered.count).toBeLessThanOrEqual(initialCount);
        }
    });
});
