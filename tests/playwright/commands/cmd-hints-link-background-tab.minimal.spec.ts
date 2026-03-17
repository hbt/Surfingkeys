/**
 * Playwright Test: cmd_hints_link_background_tab (minimal)
 *
 * Converted from tests/cdp/commands/cmd-hints-link-background-tab.minimal.test.ts
 * Key: 'C' (Shift+c) / 'gf' — Open link in background tab (stays on current tab).
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-link-background-tab.minimal.spec.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/hints-test.html`;

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

function getPages() {
    return context.pages();
}

async function waitForTabCount(expectedCount: number, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (getPages().length === expectedCount) return;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`waitForTabCount: timed out waiting for ${expectedCount} tabs, got ${getPages().length}`);
}

async function closeExtraPages(fixturePage: Page) {
    for (const p of getPages()) {
        if (p !== fixturePage) {
            try { await p.close(); } catch (_) {}
        }
    }
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_link_background_tab minimal (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
        await closeExtraPages(page);
        await page.waitForTimeout(100);
    });

    test.afterAll(async () => {
        try { await context?.close(); } catch (_) {}
    });

    // -----------------------------------------------------------------------
    // 1.0 Basic test: C key and shadow DOM
    // -----------------------------------------------------------------------

    test('1.1 should have no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    test('1.2 should create hints when pressing C key', async () => {
        await page.mouse.click(100, 100);
        await page.waitForTimeout(500);

        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 5);

        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(true);
        expect(snap.count).toBeGreaterThan(5);
    });

    test('1.3 should show hints in shadowRoot', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 5);

        const hostInfo = await page.evaluate(() => {
            const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
            return {
                found: !!hintsHost,
                hasShadowRoot: !!hintsHost?.shadowRoot,
                divCount: hintsHost?.shadowRoot?.querySelectorAll('div').length || 0,
            };
        });

        expect(hostInfo.found).toBe(true);
        expect(hostInfo.hasShadowRoot).toBe(true);
        expect(hostInfo.divCount).toBeGreaterThan(0);
    });

    test('1.4 should clear hints on Escape', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 5);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 2.0 Background Tab Behavior
    // -----------------------------------------------------------------------

    test('2.1 should open link in background tab (new tab created)', async () => {
        const initialCount = getPages().length;

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 5);

        const snapshot = await fetchHintSnapshot(page);
        const firstHint: string = snapshot.sortedHints[0];
        expect(firstHint).toBeDefined();

        for (const char of firstHint) {
            await page.keyboard.press(char);
            await page.waitForTimeout(50);
        }

        await waitForTabCount(initialCount + 1);
        expect(getPages().length).toBe(initialCount + 1);
    });

    test('2.2 should keep original fixture page URL', async () => {
        const initialCount = getPages().length;

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 5);

        const snapshot = await fetchHintSnapshot(page);
        const firstHint: string = snapshot.sortedHints[0];

        for (const char of firstHint) {
            await page.keyboard.press(char);
            await page.waitForTimeout(50);
        }

        await waitForTabCount(initialCount + 1);
        // Fixture page URL should not have changed
        expect(page.url()).toContain('hints-test.html');
    });
});
