/**
 * Playwright Test: visual mode search engine popup ('s' prefix)
 *
 * Tests the keystroke popup that appears when pressing 's' in visual mode,
 * including rich hint expansion with search engine names and the 'sg' flow
 * that opens a Google search tab with the selected text.
 *
 * Regression for: [fix] Search alias annotations: show engine names in
 * keystroke popup + help page (0ce06c9)
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-visual-search-popup.spec.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'visual_search_popup';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

/**
 * Enter visual mode (Caret/state=1) by placing a caret in #line2 then calling
 * cmd_visual_restore. This mirrors the flow from the scratch test.
 */
async function enterVisualMode(page: Page): Promise<void> {
    await page.evaluate(() => {
        const elem = document.querySelector('#line2') as HTMLElement;
        if (elem?.firstChild) {
            const range = document.createRange();
            range.setStart(elem.firstChild, 0);
            range.collapse(true);
            window.getSelection()?.removeAllRanges();
            window.getSelection()?.addRange(range);
        }
    });
    await page.waitForTimeout(100);
    await invokeCommand(page, 'cmd_visual_restore');
    await page.waitForTimeout(300);
}

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('visual mode search engine popup', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(800);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(100);
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(100);
    });

    test('pressing s in visual mode shows keystroke popup', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await enterVisualMode(page);
                await expect(page.locator('.surfingkeys_cursor')).toBeVisible({ timeout: 5000 });

                await page.keyboard.press('s');

                const keystroke = page.frameLocator('iframe[src*="frontend.html"]').locator('#sk_keystroke');
                await expect(keystroke).toBeVisible({ timeout: 3000 });
                await expect(keystroke).toContainText('s');
            },
        );
    });

    test('s prefix expands to search engine candidates with engine names', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await enterVisualMode(page);
                await expect(page.locator('.surfingkeys_cursor')).toBeVisible({ timeout: 5000 });

                await page.keyboard.press('s');

                const keystroke = page.frameLocator('iframe[src*="frontend.html"]').locator('#sk_keystroke');
                await expect(keystroke).toBeVisible({ timeout: 3000 });

                // Wait for richHintsForKeystroke timeout (default 1000ms) + buffer
                await page.waitForTimeout(1300);

                // expandRichHints class must be present — fails if annotation is empty/missing
                await expect(keystroke).toHaveClass(/expandRichHints/, { timeout: 2000 });

                // At least 8 kbd elements: sg, sd, sb, se, sw, ss, sh, sy (may be more if user has extra aliases)
                const kbds = keystroke.locator('kbd');
                const kbdCount = await kbds.count();
                expect(kbdCount).toBeGreaterThanOrEqual(8);

                // 'g' (Google) and 'd' (DuckDuckGo) suffixes present
                const kbdTexts = await kbds.allTextContents();
                expect(kbdTexts).toContain('g');
                expect(kbdTexts).toContain('d');

                // Engine names substituted — no literal '{0}' placeholder
                const allText = await keystroke.textContent();
                expect(allText).toContain('google');
                expect(allText).toContain('duckduckgo');
                expect(allText).not.toContain('{0}');
            },
        );
    });

    test('sg in visual mode opens Google search with selected text', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await enterVisualMode(page);
                await expect(page.locator('.surfingkeys_cursor')).toBeVisible({ timeout: 5000 });

                // Switch to Range mode so modifySelection uses "extend"
                const toggleOk = await invokeCommand(page, 'cmd_visual_toggle');
                expect(toggleOk).toBe(true);
                await page.waitForTimeout(100);

                // Extend selection to end of line
                const lineEndOk = await invokeCommand(page, 'cmd_visual_line_end');
                expect(lineEndOk).toBe(true);
                await page.waitForTimeout(200);

                const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
                expect(selectedText.length).toBeGreaterThan(0);

                const newPagePromise = context.waitForEvent('page', { timeout: 10000 });

                await page.keyboard.press('s');
                await page.waitForTimeout(50);
                await page.keyboard.press('g');

                const newPage = await newPagePromise;
                await newPage.waitForLoadState('domcontentloaded').catch(() => {});

                const url = newPage.url();
                expect(url).toContain('google.com');

                await newPage.close();
            },
        );
    });
});
