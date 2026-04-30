/**
 * Playwright Test: cmd_hints_learn_element
 *
 * Tests for the 'l' subcommand within regional hints mode.
 * - Key: l (after entering regional hints with 'L' and selecting an element)
 * - Behavior: Open LLM chat with element's text content, exit regional hints mode
 *
 * Converted from tests/cdp/commands/cmd-hints-learn-element.test.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

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

test.describe('cmd_hints_learn_element (Playwright)', () => {
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
        await page.evaluate(() => {
            document.querySelectorAll('.surfingkeys_hints_host').forEach(h => h.remove());
        });
        await page.evaluate(() => window.scrollTo(0, 0));
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_hints_learn_element');
        await cov?.close();
        await context?.close();
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 page has paragraph elements with text', async () => {
        const pCount = await page.locator('p').count();
        expect(pCount).toBeGreaterThan(40);

        const hasText = await page.evaluate(() => ((document.querySelector('p') as HTMLElement)?.innerText?.length ?? 0) > 0);
        expect(hasText).toBe(true);
    });

    test('1.2 no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 2.0 Learn Command
    // -----------------------------------------------------------------------

    test('2.1 l command clears hints (command executed)', async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await enterRegionalHintsAndSelectFirst(page);

        await page.keyboard.press('l');
        await waitForHintsCleared(page);

        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBe(0);
        expect(snap.found).toBe(false);
    });

    test('2.2 no hints artifacts after l command', async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await enterRegionalHintsAndSelectFirst(page);

        await page.keyboard.press('l');
        await waitForHintsCleared(page);

        const hostCount = await page.evaluate(() =>
            document.querySelectorAll('.surfingkeys_hints_host').length
        );
        expect(hostCount).toBe(0);
    });

    test('2.3 can re-enter regional hints after l command', async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await enterRegionalHintsAndSelectFirst(page);

        await page.keyboard.press('l');
        await waitForHintsCleared(page);

        // Close omnibar (may need multiple Escapes if it opened)
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
        }
        await page.evaluate(() => {
            document.querySelectorAll('.surfingkeys_hints_host').forEach(h => h.remove());
        });
        await page.waitForTimeout(300);

        // Re-enter regional hints
        await page.mouse.click(100, 100);
        await page.waitForTimeout(200);
        await page.keyboard.press('L');
        await waitForRegionalHints(page, 1);

        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(true);
        expect(snap.count).toBeGreaterThan(0);
    });

    test('2.4 element text is truthy (page data integrity)', async () => {
        const text1 = await page.evaluate(() => (document.querySelector('#line1') as HTMLElement)?.innerText || '');
        const text2 = await page.evaluate(() => (document.querySelector('#line2') as HTMLElement)?.innerText || '');
        expect(text1).toBeTruthy();
        expect(text2).toBeTruthy();
        expect(typeof text1).toBe('string');
    });
});
