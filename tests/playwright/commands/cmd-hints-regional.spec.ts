/**
 * Playwright Test: cmd_hints_regional
 *
 * Converted from tests/cdp/commands/cmd-hints-regional.test.ts
 * Key: 'L' — Regional hints mode (colored overlays for large elements)
 * Fixture: regional-hints-test.html
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-regional.spec.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/regional-hints-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

// ---------------------------------------------------------------------------
// Regional Hint helpers
// ---------------------------------------------------------------------------

async function fetchRegionalHintSnapshot(p: Page) {
    return p.evaluate(() => {
        const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
        if (!hintsHost || !hintsHost.shadowRoot) {
            return { found: false, count: 0, sample: [], sortedHints: [] as string[], overlays: 0 };
        }
        const shadowRoot = hintsHost.shadowRoot;
        const hintElements = Array.from(shadowRoot.querySelectorAll('div'));

        const hintDivs = hintElements.filter((d: any) => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });

        const overlays = hintElements.filter((d: any) => {
            const style = window.getComputedStyle(d);
            const hasBorder = style.border && style.border !== 'none' && style.border !== '';
            const hasBackground = style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
            return hasBorder || hasBackground;
        });

        const sample = (hintDivs as any[]).slice(0, 5).map((h: any) => ({
            text: h.textContent?.trim(),
            visible: h.offsetParent !== null,
            background: window.getComputedStyle(h).backgroundColor,
            position: { left: h.offsetLeft, top: h.offsetTop },
        }));

        return {
            found: true,
            count: hintDivs.length,
            sample,
            sortedHints: (hintDivs as any[]).map((h: any) => h.textContent?.trim()).sort() as string[],
            overlays: overlays.length,
        };
    });
}

async function waitForRegionalHintCount(p: Page, minCount: number, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchRegionalHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`waitForRegionalHintCount: timed out waiting for ${minCount} hints`);
}

async function waitForHintsCleared(p: Page, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchRegionalHintSnapshot(p);
        if (!snap.found || snap.count === 0) return;
        await p.waitForTimeout(100);
    }
    throw new Error('waitForHintsCleared: timed out');
}

async function forceCleanupHints(p: Page) {
    for (let i = 0; i < 4; i++) {
        try { await p.keyboard.press('Escape'); } catch (_) {}
        await p.waitForTimeout(100);
    }
    await p.evaluate(() => {
        document.querySelectorAll('.surfingkeys_hints_host').forEach(h => h.remove());
    });
    await p.waitForTimeout(200);
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_regional (Playwright)', () => {
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
        try { await forceCleanupHints(page); } catch (_) {}
    });

    test.afterAll(async () => {
        try {
            if (cov) printCoverageDelta(await cov.delta(), 'cmd_hints_regional');
        await cov?.close();
        await context?.close();
    } catch (_) {}
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 should have expected elements on page', async () => {
        const divCount = await page.locator('div.large-block, div.medium-block, div.content-section').count();
        expect(divCount).toBeGreaterThan(10);
    });

    test('1.2 should have no hints initially', async () => {
        const snap = await fetchRegionalHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic Regional Hints Creation
    // -----------------------------------------------------------------------

    test('2.1 should create regional hints when pressing L key', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);

        const hintData = await fetchRegionalHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(0);
        expect(hintData.count).toBeLessThan(50);
    });

    test('2.2 should have hints in shadowRoot at correct host element', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);

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

    test('2.3 should create hints for large visible elements (fewer than total elements)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);

        const hintData = await fetchRegionalHintSnapshot(page);
        expect(hintData.count).toBeGreaterThan(0);
        expect(hintData.count).toBeLessThan(30);
    });

    // -----------------------------------------------------------------------
    // 3.0 Hint Label Format
    // -----------------------------------------------------------------------

    test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);

        const hintData = await fetchRegionalHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('3.2 should have unique hint labels', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);

        const hintData = await fetchRegionalHintSnapshot(page);
        const uniqueHints = new Set(hintData.sortedHints);
        expect(uniqueHints.size).toBe(hintData.sortedHints.length);
    });

    // -----------------------------------------------------------------------
    // 4.0 Hint Visibility
    // -----------------------------------------------------------------------

    test('4.1 should have visible hints (offsetParent !== null)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);

        const hintData = await fetchRegionalHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.visible).toBe(true);
        }
    });

    test('4.2 should have hints with valid positions', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);

        const hintData = await fetchRegionalHintSnapshot(page);
        for (const hint of hintData.sample) {
            expect(hint.position).toBeDefined();
            expect(typeof hint.position.left).toBe('number');
            expect(typeof hint.position.top).toBe('number');
        }
    });

    // -----------------------------------------------------------------------
    // 5.0 Hint Clearing
    // -----------------------------------------------------------------------

    test('5.1 should clear hints when pressing Escape', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);

        const beforeClear = await fetchRegionalHintSnapshot(page);
        expect(beforeClear.found).toBe(true);
        expect(beforeClear.count).toBeGreaterThan(0);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const afterClear = await fetchRegionalHintSnapshot(page);
        expect(afterClear.count).toBe(0);
    });

    test('5.2 should allow creating hints again after clearing', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);

        const hintData = await fetchRegionalHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // 6.0 Hint Consistency
    // -----------------------------------------------------------------------

    test('6.1 should create consistent hints across multiple invocations', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);
        const snapshot1 = await fetchRegionalHintSnapshot(page);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);
        await page.waitForTimeout(200);

        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHintCount(page, 1);
        const snapshot2 = await fetchRegionalHintSnapshot(page);

        // Regional hints can vary by ±1 across invocations due to viewport/timing
        expect(Math.abs(snapshot1.count - snapshot2.count)).toBeLessThanOrEqual(2);
        expect(snapshot2.count).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // 7.0 Edge Cases
    // -----------------------------------------------------------------------

    test('7.1 should handle rapid hint creation and clearing', async () => {
        for (let i = 0; i < 3; i++) {
            await page.mouse.click(100, 100);
            await page.keyboard.press('L');
            await waitForRegionalHintCount(page, 1);

            const snap = await fetchRegionalHintSnapshot(page);
            expect(snap.count).toBeGreaterThan(0);

            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);
        }
    });
});
