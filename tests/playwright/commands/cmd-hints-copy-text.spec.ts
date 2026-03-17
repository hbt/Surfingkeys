/**
 * Playwright Test: cmd_hints_copy_text
 *
 * Tests for the 'ct' subcommand within regional hints mode.
 * - Key: ct (after entering regional hints with 'L' and selecting an element)
 * - Behavior: Copy text content (innerText) from selected element to clipboard
 *
 * Converted from tests/cdp/commands/cmd-hints-copy-text.test.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;

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
            .filter(t => /^[A-Z]{1,3}$/.test(t));
    });
}

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

test.describe('cmd_hints_copy_text (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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

    test('1.1 page has paragraph elements with text', async () => {
        const pCount = await page.locator('p').count();
        expect(pCount).toBeGreaterThan(40);
    });

    test('1.2 no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 2.0 Regional Hints Entry
    // -----------------------------------------------------------------------

    test('2.1 should enter regional hints mode with L key', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);

        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(true);
        expect(snap.count).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // 3.0 Copy Text Command
    // -----------------------------------------------------------------------

    test('3.1 ct command executes without error (hints cleared)', async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await enterRegionalHintsAndSelectFirst(page);

        await page.keyboard.type('ct');

        await waitForHintsCleared(page);
        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBe(0);
    });

    test('3.2 returns to normal mode after ct (can scroll)', async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await enterRegionalHintsAndSelectFirst(page);

        await page.keyboard.type('ct');
        await waitForHintsCleared(page);

        const scrollBefore = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('j');
        await page.waitForTimeout(300);
        const scrollAfter = await page.evaluate(() => window.scrollY);
        expect(scrollAfter).toBeGreaterThan(scrollBefore);
    });

    test('3.3 page has elements with distinct text content', async () => {
        const text1 = await page.evaluate(() => (document.querySelector('#line1') as HTMLElement)?.innerText || '');
        const text2 = await page.evaluate(() => (document.querySelector('#line2') as HTMLElement)?.innerText || '');
        expect(text1).toBeTruthy();
        expect(text2).toBeTruthy();
        expect(text1).not.toBe(text2);
    });

    test('3.4 link-line innerText contains no HTML tags', async () => {
        const innerText = await page.evaluate(() => (document.querySelector('#link-line') as HTMLElement)?.innerText || '');
        expect(innerText).not.toContain('<a');
        expect(innerText).toContain('Click this link');
    });
});
