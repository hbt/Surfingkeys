import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('visual select + search engine popup', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await cov?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        // Exit visual mode and dismiss any popup
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
    });

    /**
     * Enter visual mode (caret/state=1) by clicking on text to set a browser
     * selection, then calling cmd_visual_restore which calls visual.restore() →
     * visual.enter() → visual mode active (state=1/Caret), cursor shown.
     */
    async function enterVisualMode(): Promise<void> {
        // Set a caret selection inside #line2 text node
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

        // cmd_visual_restore: visual.restore() → visual.enter() → state=1, cursor shown
        await invokeCommand(page, 'cmd_visual_restore');
        await page.waitForTimeout(300);
    }

    test('visual mode cursor visible + s shows initial popup', async () => {
        await enterVisualMode();

        // Visual mode cursor should be visible
        await expect(page.locator('.surfingkeys_cursor')).toBeVisible({ timeout: 5000 });

        // Press 's' — prefix for all sg/sd/sb/se/sw/ss/sh/sy vmapkeys
        await page.keyboard.press('s');

        // Keystroke popup should appear in the frontend iframe
        const keystroke = page.frameLocator('iframe[src*="frontend.html"]').locator('#sk_keystroke');
        await expect(keystroke).toBeVisible({ timeout: 3000 });
        await expect(keystroke).toContainText('s');

        // Wait for iframe resize flush
        await page.waitForTimeout(150);
        await page.screenshot({ path: 'test-artifacts/results/scratch-visual-search-initial.png' });
    });

    test('s prefix in visual mode expands to search engine candidates', async () => {
        await enterVisualMode();
        await expect(page.locator('.surfingkeys_cursor')).toBeVisible({ timeout: 5000 });

        await page.keyboard.press('s');

        const keystroke = page.frameLocator('iframe[src*="frontend.html"]').locator('#sk_keystroke');
        await expect(keystroke).toBeVisible({ timeout: 3000 });
        await expect(keystroke).toContainText('s');

        // Wait for richHintsForKeystroke timeout (default 1000ms) + buffer
        await page.waitForTimeout(1300);

        // expandRichHints class should now be added (vmapkeys have annotations)
        await expect(keystroke).toHaveClass(/expandRichHints/, { timeout: 2000 });

        // Should show at least 8 kbd elements (sg, sd, sb, se, sw, ss, sh, sy)
        const kbds = keystroke.locator('kbd');
        const count = await kbds.count();
        expect(count).toBeGreaterThanOrEqual(8);

        // Verify Google ('g') and DuckDuckGo ('d') suffixes are present
        const kbdTexts = await kbds.allTextContents();
        expect(kbdTexts).toContain('g');
        expect(kbdTexts).toContain('d');

        // Verify descriptions include actual engine names (not literal '{0}')
        const allText = await keystroke.textContent();
        expect(allText).toContain('google');
        expect(allText).toContain('duckduckgo');
        expect(allText).not.toContain('{0}');

        await page.waitForTimeout(150);
        await page.screenshot({ path: 'test-artifacts/results/scratch-visual-search-candidates.png' });
    });

    test('completing sg opens Google search with selected text', async () => {
        await enterVisualMode();
        await expect(page.locator('.surfingkeys_cursor')).toBeVisible({ timeout: 5000 });

        // Advance to Range mode (state 2): toggle from Caret (state 1) → Range (state 2).
        // In state 2, modifySelection uses "extend" instead of "move".
        const toggleOk = await invokeCommand(page, 'cmd_visual_toggle');
        expect(toggleOk).toBe(true);
        await page.waitForTimeout(100);

        // Now extend to line end (state 2 → modifySelection uses "extend")
        const ok = await invokeCommand(page, 'cmd_visual_line_end');
        expect(ok).toBe(true);
        await page.waitForTimeout(200);

        // Verify text is selected
        const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
        expect(selectedText.length).toBeGreaterThan(0);

        // Listen for new tab before pressing keys
        const newPagePromise = context.waitForEvent('page', { timeout: 10000 });

        // Press 's' then 'g' for the sg vmapkey (search selected with Google)
        await page.keyboard.press('s');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');

        const newPage = await newPagePromise;
        await newPage.waitForLoadState('domcontentloaded').catch(() => {});

        const url = newPage.url();
        expect(url).toContain('google.com');

        await newPage.close();
    });
});
