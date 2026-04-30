/**
 * Playwright Test: cmd_hints_query_word
 *
 * Converted from tests/cdp/commands/cmd-hints-query-word.test.ts
 * Key: 'cq' — Show hints to select and query a word
 * Fixture: hints-test.html
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-query-word.spec.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/hints-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

// ---------------------------------------------------------------------------
// Hint helpers
// ---------------------------------------------------------------------------

async function fetchHintSnapshot(p: Page) {
    return p.evaluate(() => {
        const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
        if (!hintsHost || !hintsHost.shadowRoot) {
            return { found: false, count: 0, sample: [], sortedHints: [] as string[] };
        }
        const shadowRoot = hintsHost.shadowRoot;
        const hintDivs = Array.from(shadowRoot.querySelectorAll('div')).filter((d: any) => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });
        const sample = (hintDivs as any[]).slice(0, 5).map((h: any) => ({
            text: h.textContent?.trim(),
            visible: h.offsetParent !== null,
            position: { left: h.offsetLeft, top: h.offsetTop },
        }));
        return {
            found: true,
            count: hintDivs.length,
            sample,
            sortedHints: (hintDivs as any[]).map((h: any) => h.textContent?.trim()).sort() as string[],
        };
    });
}

async function waitForHintCount(p: Page, minCount: number, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`waitForHintCount: timed out waiting for ${minCount} hints`);
}

async function waitForHintsCleared(p: Page, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (!snap.found || snap.count === 0) return;
        await p.waitForTimeout(100);
    }
    throw new Error('waitForHintsCleared: timed out');
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_query_word (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test.afterAll(async () => {
        try {
            if (cov) printCoverageDelta(await cov.delta(), 'cmd_hints_query_word');
        await cov?.close();
        await context?.close();
    } catch (_) {}
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 should have text content on page', async () => {
        const textLength = await page.evaluate(() => document.body.innerText.trim().length);
        expect(textLength).toBeGreaterThan(100);
    });

    test('1.2 should have no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic Hint Creation
    // -----------------------------------------------------------------------

    test('2.1 should create hints when pressing cq keys', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(5);
    });

    test('2.2 should create text anchor hints (more than link hints)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);

        const hintData = await fetchHintSnapshot(page);
        // cq creates text anchor hints — more numerous than link hints
        expect(hintData.count).toBeGreaterThan(10);
        expect(hintData.count).toBeLessThan(500);
    });

    // -----------------------------------------------------------------------
    // 3.0 Hint Label Format
    // -----------------------------------------------------------------------

    test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('3.2 should have unique hint labels', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);

        const hintData = await fetchHintSnapshot(page);
        const uniqueHints = new Set(hintData.sortedHints);
        expect(uniqueHints.size).toBe(hintData.sortedHints.length);
    });

    // -----------------------------------------------------------------------
    // 4.0 Hint Clearing
    // -----------------------------------------------------------------------

    test('4.1 should clear hints when pressing Escape', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);

        const beforeClear = await fetchHintSnapshot(page);
        expect(beforeClear.found).toBe(true);
        expect(beforeClear.count).toBeGreaterThan(5);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const afterClear = await fetchHintSnapshot(page);
        expect(afterClear.count).toBe(0);
    });

    test('4.2 should allow creating hints again after clearing', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(5);
    });

    // -----------------------------------------------------------------------
    // 5.0 Hint Interaction
    // -----------------------------------------------------------------------

    test('5.1 should filter hints when typing hint label', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);

        const initialSnapshot = await fetchHintSnapshot(page);
        const initialCount = initialSnapshot.count;
        const firstHint: string = initialSnapshot.sortedHints[0];
        expect(firstHint).toBeDefined();

        if (firstHint && firstHint.length > 0) {
            await page.keyboard.press(firstHint[0]);
            await page.waitForTimeout(200);

            const filteredSnapshot = await fetchHintSnapshot(page);
            expect(filteredSnapshot.count).toBeLessThanOrEqual(initialCount);
        }
    });

    test('5.2 should clear hints after selecting hint by label', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);

        const snapshot = await fetchHintSnapshot(page);
        const firstHint: string = snapshot.sortedHints[0];

        if (firstHint) {
            for (const char of firstHint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }

            await waitForHintsCleared(page);

            const afterSnapshot = await fetchHintSnapshot(page);
            expect(afterSnapshot.count).toBe(0);
        }
    });

    // -----------------------------------------------------------------------
    // 6.0 Hint Consistency
    // -----------------------------------------------------------------------

    test('6.1 should create consistent hints across multiple invocations', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);
        const snapshot1 = await fetchHintSnapshot(page);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('c');
        await page.keyboard.press('q');
        await waitForHintCount(page, 5);
        const snapshot2 = await fetchHintSnapshot(page);

        expect(snapshot1.count).toBe(snapshot2.count);
        expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
    });
});
