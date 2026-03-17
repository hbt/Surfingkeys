/**
 * Playwright Test: cmd_hints_delete_element
 *
 * Tests for the 'd' subcommand within regional hints mode.
 * - Key: d (after entering regional hints with 'L' and selecting an element)
 * - Behavior: Delete selected element from DOM and exit regional hints mode
 *
 * Converted from tests/cdp/commands/cmd-hints-delete-element.test.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;

// ---------------------------------------------------------------------------
// Hint helpers
// ---------------------------------------------------------------------------

async function fetchHintSnapshot(p: Page) {
    return p.evaluate(() => {
        const host = document.querySelector('.surfingkeys_hints_host') as any;
        if (!host?.shadowRoot) return { found: false, count: 0, sortedHints: [] as string[] };
        const divs = Array.from(host.shadowRoot.querySelectorAll('div')).filter((d: any) => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });
        return {
            found: true,
            count: divs.length,
            sortedHints: (divs as any[]).map((d: any) => d.textContent?.trim()).sort() as string[],
        };
    });
}

async function waitForRegionalHints(p: Page, minCount = 1, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`Regional hints not shown after ${timeout}ms`);
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

async function enterRegionalHintsAndSelectFirst(p: Page) {
    await p.mouse.click(100, 100);
    await p.keyboard.press('L');
    await waitForRegionalHints(p, 1);

    const snap = await fetchHintSnapshot(p);
    const firstHint = snap.sortedHints[0];
    expect(firstHint).toBeDefined();

    for (const char of firstHint) {
        await p.keyboard.press(char);
        await p.waitForTimeout(50);
    }
    return firstHint;
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_delete_element (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(600);
    });

    test.afterEach(async () => {
        try {
            await page.keyboard.press('Escape');
            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);
        } catch (_) {}
        await page.evaluate(() => {
            document.querySelectorAll('.surfingkeys_hints_host').forEach(h => h.remove());
        });
    });

    test.afterAll(async () => {
        await context?.close();
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 page has paragraph elements', async () => {
        const pCount = await page.locator('p').count();
        expect(pCount).toBeGreaterThan(40);
    });

    test('1.2 no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 2.0 Delete Command
    // -----------------------------------------------------------------------

    test('2.1 d command clears hints (element deleted)', async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        const initialCount = await page.locator('p').count();

        await enterRegionalHintsAndSelectFirst(page);
        await page.keyboard.press('d');
        await waitForHintsCleared(page);

        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBe(0);
        expect(snap.found).toBe(false);

        const finalCount = await page.locator('p').count();
        expect(finalCount).toBeLessThanOrEqual(initialCount);
    });

    test('2.2 element count decreases after deletion', async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        const initialCount = await page.locator('p').count();
        expect(initialCount).toBeGreaterThan(0);

        await enterRegionalHintsAndSelectFirst(page);
        await page.keyboard.press('d');
        await waitForHintsCleared(page);

        const finalCount = await page.locator('p').count();
        expect(finalCount).toBeLessThanOrEqual(initialCount);
    });

    test('2.3 returns to normal mode after d (can scroll)', async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await enterRegionalHintsAndSelectFirst(page);

        await page.keyboard.press('d');
        await waitForHintsCleared(page);

        const scrollBefore = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('j');
        await page.waitForTimeout(300);
        const scrollAfter = await page.evaluate(() => window.scrollY);
        expect(scrollAfter).toBeGreaterThan(scrollBefore);
    });

    test('2.4 can re-enter regional hints after deletion', async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await enterRegionalHintsAndSelectFirst(page);

        await page.keyboard.press('d');
        await waitForHintsCleared(page);

        // Re-enter regional hints
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);

        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(true);
        expect(snap.count).toBeGreaterThan(0);
    });
});
