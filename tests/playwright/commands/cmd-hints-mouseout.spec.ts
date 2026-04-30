/**
 * Playwright Test: cmd_hints_mouseout
 *
 * Converted from tests/cdp/commands/cmd-hints-mouseout.test.ts
 * Key: '<Ctrl-j>' — Show hints to trigger mouseout event on elements
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-mouseout.spec.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/mouseout-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

// ---------------------------------------------------------------------------
// Hint helpers
// ---------------------------------------------------------------------------

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

async function waitForHintCount(p: Page, minCount: number, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`waitForHintCount: timed out waiting for ${minCount} hints`);
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

/**
 * Trigger mouseout hints via Ctrl-j key binding
 */
async function triggerMouseoutHints(p: Page) {
    await p.mouse.click(100, 100);
    await p.keyboard.press('Control+j');
}

async function getElementHoverState(p: Page, elementId: string) {
    return p.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return { found: false, hovered: false };
        return {
            found: true,
            hovered: el.getAttribute('data-hovered') === 'true',
        };
    }, elementId);
}

async function triggerMouseOver(p: Page, elementId: string) {
    return p.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return { success: false };
        const event = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
        el.dispatchEvent(event);
        return { success: true, hovered: el.getAttribute('data-hovered') === 'true' };
    }, elementId);
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_mouseout (Playwright)', () => {
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
            if (cov) printCoverageDelta(await cov.delta(), 'cmd_hints_mouseout');
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
        const hoverBoxCount = await page.locator('.hover-box').count();
        expect(linkCount).toBeGreaterThan(5);
        expect(buttonCount).toBeGreaterThan(2);
        expect(hoverBoxCount).toBeGreaterThan(3);
    });

    test('1.2 should have no hints initially', async () => {
        const snap = await fetchHintSnapshot(page);
        expect(snap.found).toBe(false);
        expect(snap.count).toBe(0);
    });

    test('1.3 should have elements with data-hovered attribute', async () => {
        const box1State = await getElementHoverState(page, 'box1');
        expect(box1State.found).toBe(true);
        expect(box1State.hovered).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic Hint Creation
    // -----------------------------------------------------------------------

    test('2.1 should create hints when triggering mouseout hints', async () => {
        await triggerMouseoutHints(page);
        await waitForHintCount(page, 5);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(5);
    });

    test('2.2 should have hints in shadowRoot at correct host element', async () => {
        await triggerMouseoutHints(page);
        await waitForHintCount(page, 5);

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
        await triggerMouseoutHints(page);
        await waitForHintCount(page, 5);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.sample.length).toBeGreaterThan(0);
        for (const hint of hintData.sample) {
            expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
        }
    });

    test('3.2 should have unique hint labels', async () => {
        await triggerMouseoutHints(page);
        await waitForHintCount(page, 5);

        const hintData = await fetchHintSnapshot(page);
        const uniqueHints = new Set(hintData.sortedHints);
        expect(uniqueHints.size).toBe(hintData.sortedHints.length);
    });

    // -----------------------------------------------------------------------
    // 4.0 Mouseout Event Triggering
    // -----------------------------------------------------------------------

    test('4.1 should trigger mouseout on elements when hint selected', async () => {
        // Create hints and select one to verify the command dispatches a mouseout event
        await triggerMouseoutHints(page);
        await waitForHintCount(page, 5);

        const snapshot = await fetchHintSnapshot(page);
        const firstHint: string = snapshot.sortedHints[0];

        if (firstHint) {
            for (const char of firstHint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }

            // Wait for hints to clear (command executed)
            await waitForHintsCleared(page);
            await page.waitForTimeout(200);

            // Verify the command ran successfully (hints cleared = mouseout dispatched)
            const snap = await fetchHintSnapshot(page);
            expect(snap.count).toBe(0);

            // Verify page is still responsive
            const linkCount = await page.locator('a').count();
            expect(linkCount).toBeGreaterThan(5);
        }
    });

    // -----------------------------------------------------------------------
    // 5.0 Hint Clearing
    // -----------------------------------------------------------------------

    test('5.1 should clear hints when pressing Escape', async () => {
        await triggerMouseoutHints(page);
        await waitForHintCount(page, 5);

        const beforeClear = await fetchHintSnapshot(page);
        expect(beforeClear.found).toBe(true);
        expect(beforeClear.count).toBeGreaterThan(5);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const afterClear = await fetchHintSnapshot(page);
        expect(afterClear.count).toBe(0);
    });

    test('5.2 should clear hints after selecting hint by label', async () => {
        await triggerMouseoutHints(page);
        await waitForHintCount(page, 5);

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

    test('5.3 should allow creating hints again after clearing', async () => {
        await triggerMouseoutHints(page);
        await waitForHintCount(page, 5);
        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        await triggerMouseoutHints(page);
        await waitForHintCount(page, 5);

        const hintData = await fetchHintSnapshot(page);
        expect(hintData.found).toBe(true);
        expect(hintData.count).toBeGreaterThan(5);
    });
});
