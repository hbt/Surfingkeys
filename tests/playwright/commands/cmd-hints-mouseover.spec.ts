/**
 * Playwright Test: cmd_hints_mouseover
 *
 * Converted from tests/cdp/commands/cmd-hints-mouseover.test.ts
 * Key: '<Ctrl-h>' — Show hints to trigger mouseover events on elements
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-mouseover.spec.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/mouseover-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

// ---------------------------------------------------------------------------
// Hint helpers
// ---------------------------------------------------------------------------

async function fetchHintLabels(p: Page): Promise<string[]> {
    return p.evaluate(() => {
        const host = document.querySelector('.surfingkeys_hints_host') as any;
        if (!host?.shadowRoot) return [];
        const holder = host.shadowRoot.querySelector('[mode]');
        if (!holder) return [];
        return Array.from(holder.querySelectorAll('div'))
            .map((d: any) => d.textContent?.trim() ?? '')
            .filter((t: string) => /^[A-Z]{1,3}$/.test(t));
    });
}

async function waitForHints(p: Page, minCount = 1, timeout = 5000): Promise<string[]> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const labels = await fetchHintLabels(p);
        if (labels.length >= minCount) return labels;
        await p.waitForTimeout(100);
    }
    throw new Error(`Hints not shown after ${timeout}ms`);
}

async function fetchHintSnapshot(p: Page) {
    return p.evaluate(() => {
        const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
        if (!hintsHost || !hintsHost.shadowRoot) {
            return { found: false, count: 0, sample: [], sortedHints: [] };
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
            sortedHints: (hintDivs as any[]).map((h: any) => h.textContent?.trim()).sort(),
        };
    });
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

async function getAllMouseoverCounts(p: Page): Promise<Record<string, number>> {
    return p.evaluate(() => {
        return (window as any).getAllMouseoverCounts ? (window as any).getAllMouseoverCounts() : {};
    });
}

async function resetMouseoverCounts(p: Page) {
    await p.evaluate(() => {
        if ((window as any).resetMouseoverCounts) (window as any).resetMouseoverCounts();
    });
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_mouseover (Playwright)', () => {
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
            if (cov) printCoverageDelta(await cov.delta(), 'cmd_hints_mouseover');
        await cov?.close();
        await context?.close();
    } catch (_) {}
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 should have expected interactive elements on page', async () => {
        const linkCount = await page.locator('a').count();
        const buttonCount = await page.locator('button').count();
        const imgCount = await page.locator('img').count();
        expect(linkCount).toBeGreaterThanOrEqual(5);
        expect(buttonCount).toBeGreaterThanOrEqual(4);
        expect(imgCount).toBeGreaterThanOrEqual(3);
    });

    test('1.2 should have no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic Hint Creation
    // -----------------------------------------------------------------------

    test('2.1 should create hints when pressing Ctrl-h key', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Control+h');
        await waitForHints(page, 5);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThanOrEqual(8);
    });

    test('2.2 should have hints in shadowRoot at correct host element', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Control+h');
        await waitForHints(page, 5);

        const hostInfo = await page.evaluate(() => {
            const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
            return {
                found: !!hintsHost,
                hasShadowRoot: !!hintsHost?.shadowRoot,
                shadowRootChildren: hintsHost?.shadowRoot?.children.length || 0,
            };
        });

        expect(hostInfo.found).toBe(true);
        expect(hostInfo.hasShadowRoot).toBe(true);
        expect(hostInfo.shadowRootChildren).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // 3.0 Hint Label Format
    // -----------------------------------------------------------------------

    test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Control+h');
        await waitForHints(page, 5);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('3.2 should have unique hint labels', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Control+h');
        await waitForHints(page, 5);

        const hintData = await fetchHintSnapshot(page);
        const uniqueHints = new Set(hintData.sortedHints);
        expect(uniqueHints.size).toBe(hintData.sortedHints.length);
    });

    // -----------------------------------------------------------------------
    // 4.0 Mouseover Event Triggering
    // -----------------------------------------------------------------------

    test('4.1 should trigger mouseover event when selecting hint', async () => {
        await resetMouseoverCounts(page);
        await page.mouse.click(100, 100);
        await page.keyboard.press('Control+h');
        await waitForHints(page, 5);

        const snapshot = await fetchHintSnapshot(page);
        const firstHint: string = snapshot.sortedHints[0];
        expect(firstHint).toBeDefined();

        if (firstHint) {
            for (const char of firstHint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }

            await waitForHintsCleared(page);
            // Wait for event propagation to update data attributes
            await page.waitForTimeout(300);

            const afterCounts = await getAllMouseoverCounts(page);
            const totalAfter = Object.values(afterCounts).reduce((a: number, b: number) => a + b, 0);
            expect(totalAfter).toBeGreaterThan(0);
        }
    });

    test('4.2 should not trigger mouseover when canceling with Escape', async () => {
        await resetMouseoverCounts(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('Control+h');
        await waitForHints(page, 5);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);
        await page.waitForTimeout(200);

        // After Escape (no selection), total should remain 0
        const afterCounts = await getAllMouseoverCounts(page);
        const total = Object.values(afterCounts).reduce((a: number, b: number) => a + b, 0);
        expect(total).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 5.0 Hint Clearing
    // -----------------------------------------------------------------------

    test('5.1 should clear hints when pressing Escape', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Control+h');
        await waitForHints(page, 5);

        const beforeClear = await fetchHintSnapshot(page);
        expect(beforeClear.found).toBe(true);
        expect(beforeClear.count).toBeGreaterThan(5);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const afterClear = await fetchHintSnapshot(page);
        expect(afterClear.count).toBe(0);
    });

    test('5.2 should allow creating hints again after clearing', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Control+h');
        await waitForHints(page, 5);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('Control+h');
        await waitForHints(page, 5);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(5);
    });
});
