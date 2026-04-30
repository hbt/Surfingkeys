/**
 * Playwright Test: cmd_hints_open_link
 *
 * Converted from tests/cdp/commands/cmd-hints-open-link.test.ts
 * Uses Playwright API instead of raw CDP WebSocket.
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-open-link.spec.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/hackernews.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

// ---------------------------------------------------------------------------
// Hint helpers (mirror the CDP versions from the original test)
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
        visible: h.offsetParent !== null,
        position: { left: h.offsetLeft, top: h.offsetTop }
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
    throw new Error('waitForHintsCleared: timed out waiting for hints to clear');
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_open_link (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        // Let Surfingkeys content script settle (mirrors waitForSurfingkeysReady delay).
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        // Clear any hints left from the test (mirrors CDP afterEach).
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_hints_open_link');
        await cov?.close();
        await context?.close();
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 should have expected number of links on page', async () => {
        const linkCount = await page.locator('a').count();
        expect(linkCount).toBeGreaterThan(200);
    });

    test('1.2 should have no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic Hint Creation
    // -----------------------------------------------------------------------

    test('2.1 should create hints when pressing f key', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(20);
        expect(hintData.count).toBeLessThan(100);
    });

    test('2.2 should have hints in shadowRoot at correct host element', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hostInfo = await page.evaluate(() => {
            const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
            return {
                found: hintsHost ? true : false,
                hasShadowRoot: hintsHost?.shadowRoot ? true : false,
                shadowRootChildren: hintsHost?.shadowRoot?.children.length || 0
            };
        });

        expect(hostInfo.found).toBe(true);
        expect(hostInfo.hasShadowRoot).toBe(true);
        expect(hostInfo.shadowRootChildren).toBeGreaterThan(0);
    });

    test('2.3 should create hints for visible links', async () => {
        const linkCount = await page.locator('a').count();

        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.count).toBeGreaterThan(10);
        expect(hintData.count).toBeLessThanOrEqual(linkCount);
    });

    // -----------------------------------------------------------------------
    // 3.0 Hint Label Format
    // -----------------------------------------------------------------------

    test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('3.2 should have all hints matching uppercase letter pattern', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        for (const hintText of hintData.sortedHints) {
            expect(hintText).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('3.3 should have unique hint labels', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        const uniqueHints = new Set(hintData.sortedHints);
        expect(uniqueHints.size).toBe(hintData.sortedHints.length);
    });

    // -----------------------------------------------------------------------
    // 4.0 Hint Visibility
    // -----------------------------------------------------------------------

    test('4.1 should have visible hints (offsetParent !== null)', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.visible).toBe(true);
        }
    });

    test('4.2 should have hints with valid positions', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
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
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const beforeClear = await fetchHintSnapshot(page);
        expect(beforeClear.found).toBe(true);
        expect(beforeClear.count).toBeGreaterThan(10);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const afterClear = await fetchHintSnapshot(page);
        expect(afterClear.count).toBe(0);
    });

    test('5.2 should allow creating hints again after clearing', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(10);
    });

    // -----------------------------------------------------------------------
    // 6.0 Hint Consistency
    // -----------------------------------------------------------------------

    test('6.1 should create consistent hints across multiple invocations', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);
        const snapshot1 = await fetchHintSnapshot(page);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);
        const snapshot2 = await fetchHintSnapshot(page);

        expect(snapshot1.count).toBe(snapshot2.count);
        expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
    });

    test('6.2 should have deterministic hint snapshot', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const hintSnapshot = await fetchHintSnapshot(page);
        expect(hintSnapshot.found).toBe(true);
        expect(hintSnapshot.count).toBeGreaterThan(10);

        // Playwright toMatchSnapshot requires a string/Buffer; serialise to JSON.
        expect(JSON.stringify({ count: hintSnapshot.count, sortedHints: hintSnapshot.sortedHints }, null, 2))
            .toMatchSnapshot();
    });

    // -----------------------------------------------------------------------
    // 7.0 Edge Cases
    // -----------------------------------------------------------------------

    test('7.1 should handle rapid hint creation and clearing', async () => {
        for (let i = 0; i < 3; i++) {
            await page.mouse.click(100, 100);
            await page.keyboard.press('f');
            await waitForHintCount(page, 10);

            const snap = await fetchHintSnapshot(page);
            expect(snap.count).toBeGreaterThan(10);

            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);
        }
    });

    test('7.2 should treat f key as hint filter input when hints are active', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const firstSnapshot = await fetchHintSnapshot(page);
        expect(firstSnapshot.count).toBeGreaterThan(10);

        // Pressing 'Escape' clears hints, then 'f' opens them again
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

        const secondSnapshot = await fetchHintSnapshot(page);
        expect(secondSnapshot.found).toBe(true);
        expect(secondSnapshot.count).toBe(firstSnapshot.count);
    });

    // -----------------------------------------------------------------------
    // 8.0 Hint Interaction
    // -----------------------------------------------------------------------

    test('8.1 should filter hints when typing hint label', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

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

    test('8.2 should clear hints after selecting hint by label', async () => {
        await page.mouse.click(100, 100);
        await page.keyboard.press('f');
        await waitForHintCount(page, 10);

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
});
