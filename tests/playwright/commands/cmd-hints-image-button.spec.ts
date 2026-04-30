/**
 * Playwright Test: cmd_hints_image_button
 *
 * Converted from tests/cdp/commands/cmd-hints-image-button.test.ts
 * Key: 'q' — Show hints to click on images and buttons.
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-image-button.spec.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_hints_image_button';
const FIXTURE_URL = `${FIXTURE_BASE}/buttons-images-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

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

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_image_button (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test.afterAll(async () => {
        try {
            await covBg?.close();
            await context?.close();
        } catch (_) {}
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 should have buttons on page', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const count = await page.locator('button').count();
            expect(count).toBeGreaterThan(10);
        });
    });

    test('1.2 should have images on page', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const count = await page.locator('img').count();
            expect(count).toBeGreaterThan(5);
        });
    });

    test('1.3 should have no hints initially', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const snap = await fetchHintSnapshot(page);
            expect(snap.found).toBe(false);
            expect(snap.count).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic Hint Creation via q key
    // -----------------------------------------------------------------------

    test('2.1 should create hints when pressing q key', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
            await waitForHintCount(page, 5);

            const hintData = await fetchHintSnapshot(page);
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(5);
        });
    });

    test('2.2 should have hints in shadowRoot', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
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
    });

    // -----------------------------------------------------------------------
    // 3.0 Hint Label Format
    // -----------------------------------------------------------------------

    test('3.1 should have properly formatted hint labels (uppercase letters)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
            await waitForHintCount(page, 5);

            const hintData = await fetchHintSnapshot(page);
            expect(hintData.sample.length).toBeGreaterThan(0);
            for (const hint of hintData.sample) {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            }
        });
    });

    test('3.2 should have unique hint labels', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
            await waitForHintCount(page, 5);

            const hintData = await fetchHintSnapshot(page);
            const uniqueHints = new Set(hintData.sortedHints);
            expect(uniqueHints.size).toBe(hintData.sortedHints.length);
        });
    });

    // -----------------------------------------------------------------------
    // 4.0 Hint Visibility
    // -----------------------------------------------------------------------

    test('4.1 should have visible hints', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
            await waitForHintCount(page, 5);

            const hintData = await fetchHintSnapshot(page);
            expect(hintData.sample.length).toBeGreaterThan(0);
            for (const hint of hintData.sample) {
                expect(hint.visible).toBe(true);
            }
        });
    });

    // -----------------------------------------------------------------------
    // 5.0 Hint Clearing
    // -----------------------------------------------------------------------

    test('5.1 should clear hints when pressing Escape', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
            await waitForHintCount(page, 5);

            const before = await fetchHintSnapshot(page);
            expect(before.found).toBe(true);
            expect(before.count).toBeGreaterThan(5);

            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);

            const after = await fetchHintSnapshot(page);
            expect(after.count).toBe(0);
        });
    });

    test('5.2 should allow creating hints again after clearing', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
            await waitForHintCount(page, 5);
            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);

            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
            await waitForHintCount(page, 5);

            const hintData = await fetchHintSnapshot(page);
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(5);
        });
    });

    // -----------------------------------------------------------------------
    // 6.0 Hint Consistency
    // -----------------------------------------------------------------------

    test('6.1 should create consistent hints across multiple invocations', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
            await waitForHintCount(page, 5);
            const snapshot1 = await fetchHintSnapshot(page);

            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);

            await page.mouse.click(100, 100);
            await page.keyboard.press('q');
            await waitForHintCount(page, 5);
            const snapshot2 = await fetchHintSnapshot(page);

            expect(snapshot1.count).toBe(snapshot2.count);
            expect(snapshot1.sortedHints).toEqual(snapshot2.sortedHints);
        });
    });
});
