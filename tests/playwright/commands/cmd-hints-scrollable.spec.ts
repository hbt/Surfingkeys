/**
 * Playwright Test: cmd_hints_scrollable
 *
 * Converted from tests/cdp/commands/cmd-hints-scrollable.test.ts
 * Key: ';fs' — Show hints to focus scrollable elements.
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-scrollable.spec.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scrollable-test.html`;

let context: BrowserContext;
let page: Page;

// ---------------------------------------------------------------------------
// Hint helpers
// ---------------------------------------------------------------------------

async function fetchHintSnapshot(p: Page) {
    return p.evaluate(() => {
        const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
        if (!hintsHost || !hintsHost.shadowRoot) return { found: false, count: 0, sample: [] as any[], sortedHints: [] as string[] };
        const hintDivs = Array.from(hintsHost.shadowRoot.querySelectorAll('div') as NodeListOf<HTMLElement>).filter(d => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });
        const sample = hintDivs.slice(0, 5).map(h => ({
            text: h.textContent?.trim(),
            visible: (h as any).offsetParent !== null,
            position: { left: (h as any).offsetLeft, top: (h as any).offsetTop },
        }));
        return { found: true, count: hintDivs.length, sample, sortedHints: hintDivs.map(h => h.textContent?.trim() ?? '').sort() };
    });
}

async function waitForHintCount(p: Page, minCount: number, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`waitForHintCount: timed out waiting for ${minCount} hints`);
}

async function waitForHintsCleared(p: Page, timeout = 4000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (!snap.found || snap.count === 0) return;
        await p.waitForTimeout(100);
    }
    throw new Error('waitForHintsCleared: timed out');
}

async function triggerScrollableHints(p: Page) {
    await p.keyboard.press(';');
    await p.keyboard.press('f');
    await p.keyboard.press('s');
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_scrollable (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test.afterAll(async () => {
        try { await context?.close(); } catch (_) {}
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 should have div elements on page', async () => {
        const count = await page.locator('div').count();
        expect(count).toBeGreaterThan(10);
    });

    test('1.2 should have no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic Hint Creation via ;fs
    // -----------------------------------------------------------------------

    test('2.1 should create hints when pressing ;fs', async () => {
        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThanOrEqual(3);
    });

    test('2.2 should have hints in shadowRoot', async () => {
        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);

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
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('3.2 should have unique hint labels', async () => {
        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);

        const hintData = await fetchHintSnapshot(page);
        const uniqueHints = new Set(hintData.sortedHints);
        expect(uniqueHints.size).toBe(hintData.sortedHints.length);
    });

    // -----------------------------------------------------------------------
    // 4.0 Hint Clearing
    // -----------------------------------------------------------------------

    test('4.1 should clear hints when pressing Escape', async () => {
        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);

        const before = await fetchHintSnapshot(page);
        expect(before.found).toBe(true);
        expect(before.count).toBeGreaterThanOrEqual(3);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const after = await fetchHintSnapshot(page);
        expect(after.count).toBe(0);
    });

    test('4.2 should allow creating hints again after clearing', async () => {
        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThanOrEqual(3);
    });

    // -----------------------------------------------------------------------
    // 5.0 Scrollable Element Detection
    // -----------------------------------------------------------------------

    test('5.1 should detect scrollable elements (data-hint_scrollable attribute)', async () => {
        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);

        const count = await page.evaluate(() => document.querySelectorAll('[data-hint_scrollable]').length);
        expect(count).toBeGreaterThan(0);
    });

    test('5.2 should detect nested outer and inner scrollable elements', async () => {
        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);

        const result = await page.evaluate(() => {
            const outer = document.getElementById('outer-scrollable') as any;
            const inner = document.getElementById('inner-scrollable') as any;
            return {
                outerHasAttr: outer?.dataset?.hint_scrollable === 'true',
                innerHasAttr: inner?.dataset?.hint_scrollable === 'true',
            };
        });

        expect(result.outerHasAttr).toBe(true);
        expect(result.innerHasAttr).toBe(true);
    });

    test('5.3 should not hint hidden scrollable elements', async () => {
        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);

        const result = await page.evaluate(() => {
            const hidden = document.getElementById('hidden-scrollable-1') as any;
            return {
                exists: !!hidden,
                hasScrollableAttr: hidden?.dataset?.hint_scrollable === 'true',
            };
        });

        expect(result.exists).toBe(true);
        expect(result.hasScrollableAttr).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 6.0 Hint Consistency
    // -----------------------------------------------------------------------

    test('6.1 should create consistent hints across multiple invocations', async () => {
        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);
        const snapshot1 = await fetchHintSnapshot(page);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await triggerScrollableHints(page);
        await waitForHintCount(page, 3);
        const snapshot2 = await fetchHintSnapshot(page);

        expect(snapshot1.count).toBe(snapshot2.count);
        expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
    });
});
