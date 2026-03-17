/**
 * Playwright Test: cmd_hints_exit_regional
 *
 * Tests for exiting regional hints mode with Escape.
 * - Key: <Esc> (after entering regional hints with 'L')
 * - Behavior: Exit regional hints mode, clear hints/overlay, return to normal mode
 * - Fixture: regional-hints-test.html
 *
 * Note: The CDP source has nearly all tests skipped due to menu timing issues in headless
 * (menu not appearing after selecting a hint). This Playwright version tests the simpler
 * Escape-before-selection flow, plus basic regional hints entry/exit.
 *
 * Converted from tests/cdp/commands/cmd-hints-exit-regional.test.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/regional-hints-test.html`;

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

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_exit_regional (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(600);
    });

    test.afterEach(async () => {
        // Press Escape multiple times to exit all modes (mirrors CDP afterEach)
        for (let i = 0; i < 4; i++) {
            try { await page.keyboard.press('Escape'); } catch (_) {}
            await page.waitForTimeout(50);
        }
        await page.evaluate(() => {
            document.querySelectorAll('.surfingkeys_hints_host').forEach(h => h.remove());
        });
        await page.waitForTimeout(100);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 page has paragraph elements', async () => {
        const pCount = await page.locator('p').count();
        expect(pCount).toBeGreaterThan(30);
    });

    test('1.2 no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 2.0 Enter and Exit Regional Hints
    // -----------------------------------------------------------------------

    test('2.1 should enter regional hints mode with L key', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);

        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(true);
        expect(snap.count).toBeGreaterThan(0);
    });

    test('2.2 Escape clears regional hints without selecting', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);

        const before = await fetchHintSnapshot(page);
        expect(before.count).toBeGreaterThan(0);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const after = await fetchHintSnapshot(page);
        expect(after.count).toBe(0);
    });

    test('2.3 can re-enter regional hints after Escape exit', async () => {
        // First entry and exit
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        // Re-enter
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);

        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(true);
        expect(snap.count).toBeGreaterThan(0);
    });

    test('2.4 hint counts are consistent after re-entry', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);
        const snap1 = await fetchHintSnapshot(page);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);
        const snap2 = await fetchHintSnapshot(page);

        // Counts should be close (within 2) — viewport-visible elements may vary slightly
        expect(Math.abs(snap1.count - snap2.count)).toBeLessThanOrEqual(2);
    });

    test('2.5 normal mode commands work after Escape exit (can scroll)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.evaluate(() => window.scrollTo(0, 0));
        const scrollBefore = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('j');
        await page.waitForTimeout(300);
        const scrollAfter = await page.evaluate(() => window.scrollY);
        expect(scrollAfter).toBeGreaterThan(scrollBefore);
    });
});
