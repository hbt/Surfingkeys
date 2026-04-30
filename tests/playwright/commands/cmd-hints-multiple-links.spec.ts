/**
 * Playwright Test: cmd_hints_multiple_links
 *
 * Converted from tests/cdp/commands/cmd-hints-multiple-links.test.ts
 * Key: 'cf' — Open multiple links in new tabs with multipleHits mode
 * Fixture: hints-test.html
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-multiple-links.spec.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_hints_multiple_links';
const FIXTURE_URL = `${FIXTURE_BASE}/hints-test.html`;

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
        if (!hintsHost || !hintsHost.shadowRoot) {
            return { found: false, count: 0, sample: [], sortedHints: [] as string[] };
        }
        const shadowRoot = hintsHost.shadowRoot;
        const hintDivs = Array.from(shadowRoot.querySelectorAll('div')).filter((d: any) => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });
        const sample = (hintDivs as any[]).slice(0, 5).map((h: any) => ({
            text: h.textContent?.trim(),
            visible: h.offsetParent !== null,
        }));
        return {
            found: true,
            count: hintDivs.length,
            sample,
            sortedHints: (hintDivs as any[]).map((h: any) => h.textContent?.trim()).sort() as string[],
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

function getPages() {
    return context.pages();
}

async function waitForTabCount(expectedCount: number, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (getPages().length >= expectedCount) return;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`waitForTabCount: timed out, got ${getPages().length} tabs`);
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

test.describe('cmd_hints_multiple_links (Playwright)', () => {
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
        await closeExtraPages(page);
        await page.waitForTimeout(100);
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

    test('1.1 should have expected number of links on page', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const linkCount = await page.locator('a').count();
            expect(linkCount).toBeGreaterThan(10);
            expect(linkCount).toBeLessThan(100);
        });
    });

    test('1.2 should have no hints initially', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const snap = await fetchHintSnapshot(page);
            expect(snap.found).toBe(false);
            expect(snap.count).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic Hint Creation
    // -----------------------------------------------------------------------

    test('2.1 should create hints when pressing cf keys', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('c');
            await page.keyboard.press('f');
            await waitForHintCount(page, 10);

            const hintData = await fetchHintSnapshot(page);
            expect(hintData.found).toBe(true);
            expect(hintData.count).toBeGreaterThan(10);
        });
    });

    test('2.2 should have hints with valid labels (uppercase letters)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('c');
            await page.keyboard.press('f');
            await waitForHintCount(page, 10);

            const hintData = await fetchHintSnapshot(page);
            expect(hintData.sample.length).toBeGreaterThan(0);
            for (const hint of hintData.sample) {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            }
        });
    });

    // -----------------------------------------------------------------------
    // 3.0 Multiple Selection Mode
    // -----------------------------------------------------------------------

    test('3.1 should keep hints visible after selecting first hint (multipleHits mode)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('c');
            await page.keyboard.press('f');
            await waitForHintCount(page, 10);

            const beforeSelection = await fetchHintSnapshot(page);
            expect(beforeSelection.count).toBeGreaterThan(10);

            const firstHint: string = beforeSelection.sortedHints[0];
            for (const char of firstHint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }

            // Wait for hints to reset in multipleHits mode
            await page.waitForTimeout(400);

            const afterSelection = await fetchHintSnapshot(page);
            expect(afterSelection.found).toBe(true);
            expect(afterSelection.count).toBeGreaterThan(10);
        });
    });

    // -----------------------------------------------------------------------
    // 4.0 Tab Creation
    // -----------------------------------------------------------------------

    test('4.1 should open selected link in new tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialCount = getPages().length;

            await page.mouse.click(100, 100);
            await page.keyboard.press('c');
            await page.keyboard.press('f');
            await waitForHintCount(page, 10);

            const snapshot = await fetchHintSnapshot(page);
            const firstHint: string = snapshot.sortedHints[0];

            for (const char of firstHint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }

            await waitForTabCount(initialCount + 1);
            expect(getPages().length).toBeGreaterThanOrEqual(initialCount + 1);
        });
    });

    // -----------------------------------------------------------------------
    // 5.0 Hint Clearing
    // -----------------------------------------------------------------------

    test('5.1 should clear hints when pressing Escape', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('c');
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
    });
});
