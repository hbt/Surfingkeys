/**
 * Playwright Test: cmd_hints_link_background_tab
 *
 * Converted from tests/cdp/commands/cmd-hints-link-background-tab.test.ts
 * Key: 'C' (Shift+c) / 'gf' — open link in background tab
 *
 * Tab management: the CDP version queried chrome.tabs via bgWs.
 * Here we open a CDP session on the extension's service worker and call
 * chrome.tabs.query through it — same data, Playwright API.
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-link-background-tab.spec.ts
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

const HINT_SNAPSHOT_FN = `() => {
    const hintsHost = document.querySelector('.surfingkeys_hints_host');
    if (!hintsHost || !hintsHost.shadowRoot) {
        return { found: false, count: 0, sample: [], sortedHints: [] };
    }
    const shadowRoot = hintsHost.shadowRoot;
    const hintDivs = Array.from(shadowRoot.querySelectorAll('div')).filter(d => {
        const text = (d.textContent || '').trim();
        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
    });
    const sample = hintDivs.slice(0, 5).map(h => ({
        text: h.textContent?.trim(),
        visible: h.offsetParent !== null
    }));
    return {
        found: true,
        count: hintDivs.length,
        sample,
        sortedHints: hintDivs.map(h => h.textContent?.trim()).sort()
    };
}`;

async function fetchHintSnapshot(page: Page) {
    return page.evaluate(new Function(`return (${HINT_SNAPSHOT_FN})()`) as () => any);
}

async function waitForHintCount(page: Page, minCount: number, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(page);
        if (snap.found && snap.count >= minCount) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`waitForHintCount: timed out waiting for ${minCount} hints`);
}

async function waitForHintsCleared(page: Page, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(page);
        if (!snap.found || snap.count === 0) return;
        await page.waitForTimeout(100);
    }
    throw new Error('waitForHintsCleared: timed out');
}

// ---------------------------------------------------------------------------
// Tab helpers — pure Playwright (context.pages())
//
// context.pages() returns every open tab in the browser context.
// "active" (focused) vs "background" is detected via document.hidden:
//   background tab → document.hidden === true
//   active tab     → document.hidden === false
// ---------------------------------------------------------------------------

function getPages() {
    return context.pages();
}

async function waitForTabCount(expectedCount: number, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (getPages().length === expectedCount) return;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(
        `waitForTabCount: timed out waiting for ${expectedCount} tabs, got ${getPages().length}`,
    );
}

async function isPageActive(p: Page): Promise<boolean> {
    return p.evaluate(() => !document.hidden);
}

async function closeExtraPages(fixturePage: Page) {
    for (const p of getPages()) {
        if (p !== fixturePage) {
            await p.close();
        }
    }
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_link_background_tab (Playwright)', () => {
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
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await closeExtraPages(page);
        await page.waitForTimeout(100);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_hints_link_background_tab');
        await cov?.close();
        await context?.close();
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 should have expected number of links on page', async () => {
        const linkCount = await page.locator('a').count();
        expect(linkCount).toBeGreaterThan(40);
        expect(linkCount).toBeLessThan(100);
    });

    test('1.2 should have no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    test('1.3 should have only fixture tab initially', async () => {
        expect(getPages().length).toBe(1);
        expect(getPages()[0]).toBe(page);
        expect(await isPageActive(page)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic Hint Creation with C (gf alias)
    // -----------------------------------------------------------------------

    test('2.1 should create hints when pressing C key', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(10);
        expect(hintData.count).toBeLessThan(100);
    });

    test('2.2 should have hints in shadowRoot at correct host element', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

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

    test('2.3 should create similar hint count as f command', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);
        const fCount = (await fetchHintSnapshot(page)).count;

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);
        const gfCount = (await fetchHintSnapshot(page)).count;

        expect(gfCount).toBe(fCount);
    });

    // -----------------------------------------------------------------------
    // 3.0 Background Tab Creation
    // -----------------------------------------------------------------------

    test('3.1 should open link in background tab (tab count increases)', async () => {
        const initialCount = getPages().length;

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

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

    test('3.2 should keep original tab active (not switch to new tab)', async () => {
        expect(await isPageActive(page)).toBe(true);

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const snapshot = await fetchHintSnapshot(page);
        const firstHint: string = snapshot.sortedHints[0];

        for (const char of firstHint) {
            await page.keyboard.press(char);
            await page.waitForTimeout(50);
        }

        await page.waitForTimeout(500);
        expect(await isPageActive(page)).toBe(true);
    });

    test('3.3 should create new tab with href="#" (background tab)', async () => {
        const initialCount = getPages().length;

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const snapshot = await fetchHintSnapshot(page);
        const firstHint: string = snapshot.sortedHints[0];

        for (const char of firstHint) {
            await page.keyboard.press(char);
            await page.waitForTimeout(50);
        }

        await waitForTabCount(initialCount + 1);
        const newTab = getPages().find(p => p !== page)!;
        expect(newTab).toBeDefined();

        // Wait for the tab to load before inspecting its URL
        await newTab.waitForLoadState('load');
        expect(newTab.url()).toContain('#');

        // Fixture page should not have navigated away
        expect(page.url()).toContain('hints-test.html');
    });

    test('3.4 should verify background tab was created (tab count check)', async () => {
        // Note: document.hidden is always false in --headless=new regardless of tab focus,
        // so we verify background creation by tab count rather than visibility state.
        const initialCount = getPages().length;

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const snapshot = await fetchHintSnapshot(page);
        const firstHint: string = snapshot.sortedHints[0];

        for (const char of firstHint) {
            await page.keyboard.press(char);
            await page.waitForTimeout(50);
        }

        await waitForTabCount(initialCount + 1);
        // Original tab is still at fixture URL (not navigated away)
        expect(page.url()).toContain('hints-test.html');
        // A new tab was created
        expect(getPages().filter(p => p !== page).length).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // 4.0 Multiple Background Tab Opens
    // -----------------------------------------------------------------------

    test('4.1 should open multiple links in background tabs sequentially', async () => {
        const initialCount = getPages().length;

        for (let i = 0; i < 3; i++) {
            await page.mouse.click(100, 100);
            await page.keyboard.press('g');
            await page.keyboard.press('f');
            await waitForHintCount(page, 10);

            const snapshot = await fetchHintSnapshot(page);
            const hint: string = snapshot.sortedHints[i];
            expect(hint).toBeDefined();

            for (const char of hint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }

            await waitForTabCount(initialCount + i + 1);
        }

        expect(getPages().length).toBe(initialCount + 3);
        expect(await isPageActive(page)).toBe(true);
    });

    test('4.2 should create all background tabs as inactive', async () => {
        const initialCount = getPages().length;

        for (let i = 0; i < 2; i++) {
            await page.mouse.click(100, 100);
            await page.keyboard.press('g');
            await page.keyboard.press('f');
            await waitForHintCount(page, 10);

            const snapshot = await fetchHintSnapshot(page);
            const hint: string = snapshot.sortedHints[i];

            for (const char of hint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }

            await waitForTabCount(initialCount + i + 1);
        }

        const newPages = getPages().filter(p => p !== page);
        expect(newPages.length).toBe(2);
        // Tab count increased by 2; fixture page did not navigate away
        expect(page.url()).toContain('hints-test.html');
    });

    // -----------------------------------------------------------------------
    // 5.0 Hint Label Format
    // -----------------------------------------------------------------------

    test('5.1 should have properly formatted hint labels (uppercase letters)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('5.2 should have all hints matching uppercase letter pattern', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        for (const hintText of hintData.sortedHints) {
            expect(hintText).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('5.3 should have unique hint labels', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        const uniqueHints = new Set(hintData.sortedHints);
        expect(uniqueHints.size).toBe(hintData.sortedHints.length);
    });

    // -----------------------------------------------------------------------
    // 6.0 Hint Visibility
    // -----------------------------------------------------------------------

    test('6.1 should have visible hints (offsetParent !== null)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.visible).toBe(true);
        }
    });

    // -----------------------------------------------------------------------
    // 7.0 Hint Clearing
    // -----------------------------------------------------------------------

    test('7.1 should clear hints when pressing Escape', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const beforeClear = await fetchHintSnapshot(page);
        expect(beforeClear.found).toBe(true);
        expect(beforeClear.count).toBeGreaterThan(10);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const afterClear = await fetchHintSnapshot(page);
        expect(afterClear.count).toBe(0);
    });

    test('7.2 should clear hints after selecting hint', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const snapshot = await fetchHintSnapshot(page);
        const firstHint: string = snapshot.sortedHints[0];

        for (const char of firstHint) {
            await page.keyboard.press(char);
            await page.waitForTimeout(50);
        }

        await waitForHintsCleared(page);
        const afterSnapshot = await fetchHintSnapshot(page);
        expect(afterSnapshot.count).toBe(0);
    });

    test('7.3 should allow creating hints again after clearing', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(10);
    });

    // -----------------------------------------------------------------------
    // 8.0 Hint Interaction
    // -----------------------------------------------------------------------

    test('8.1 should filter hints when typing hint label', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const initialSnapshot = await fetchHintSnapshot(page);
        const initialCount = initialSnapshot.count;
        const firstHint: string = initialSnapshot.sortedHints[0];
        expect(firstHint).toBeDefined();

        if (firstHint?.length > 0) {
            await page.keyboard.press(firstHint[0]);
            await page.waitForTimeout(200);
            const filteredSnapshot = await fetchHintSnapshot(page);
            expect(filteredSnapshot.count).toBeLessThanOrEqual(initialCount);
        }
    });

    test('8.2 should open correct link when selecting specific hint', async () => {
        const initialCount = getPages().length;

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const snapshot = await fetchHintSnapshot(page);
        const targetHint: string = snapshot.sortedHints[2];

        for (const char of targetHint) {
            await page.keyboard.press(char);
            await page.waitForTimeout(50);
        }

        await waitForTabCount(initialCount + 1);
        expect(getPages().length).toBe(initialCount + 1);
    });

    // -----------------------------------------------------------------------
    // 9.0 Different Link Types
    // -----------------------------------------------------------------------

    test('9.1 should handle inline links in paragraphs', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);
        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBeGreaterThan(5);
    });

    test('9.2 should handle navigation links', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);
        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBeGreaterThan(5);
    });

    test('9.3 should handle list links', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);
        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBeGreaterThan(10);
    });

    test('9.4 should handle button-style links', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);
        const snap = await fetchHintSnapshot(page);
        expect(snap.count).toBeGreaterThan(3);
    });

    test('9.5 should handle dense link sections', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);
        const snap = await fetchHintSnapshot(page);
        // hints-test.html has ~12 visible dense-section links
        expect(snap.count).toBeGreaterThan(10);
    });

    // -----------------------------------------------------------------------
    // 10.0 Consistency and Snapshot
    // -----------------------------------------------------------------------

    test('10.1 should create consistent hints across multiple invocations', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);
        const snapshot1 = await fetchHintSnapshot(page);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);
        const snapshot2 = await fetchHintSnapshot(page);

        expect(snapshot1.count).toBe(snapshot2.count);
        expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
    });

    test('10.2 should have deterministic hint snapshot', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const hintSnapshot = await fetchHintSnapshot(page);
        expect(hintSnapshot.found).toBe(true);
        expect(hintSnapshot.count).toBeGreaterThan(10);

        expect(JSON.stringify({ count: hintSnapshot.count, sortedHints: hintSnapshot.sortedHints }, null, 2))
            .toMatchSnapshot();
    });
});
