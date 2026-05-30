import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

test.describe('keystroke autocomplete popup', () => {
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

    test.beforeEach(async () => {
        // Register two commands sharing prefix 'g' to ensure it's a valid prefix
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'gg', 'cmd_scroll_to_top');
        await callSKApi(page, 'mapcmdkey', 'gd', 'cmd_scroll_to_bottom');
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        // Dismiss any pending popup
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
    });

    test('popup appears immediately after pressing prefix key', async () => {
        const keystroke = page.frameLocator('iframe[src*="frontend.html"]').locator('#sk_keystroke');

        await page.keyboard.press('g');

        await expect(keystroke).toBeVisible({ timeout: 2000 });
        await expect(keystroke).toContainText('g');

        // Wait for iframe resize postMessage to flush (height: 0 → 100% via setFrontFrame)
        await page.waitForTimeout(150);
        await page.screenshot({ path: 'test-artifacts/results/scratch-popup-initial.png' });
    });

    test('rich hints expand with candidates after timeout', async () => {
        const keystroke = page.frameLocator('iframe[src*="frontend.html"]').locator('#sk_keystroke');

        await page.keyboard.press('g');

        // Wait for richHintsForKeystroke timeout (default 1000ms) + buffer
        await page.waitForTimeout(1300);

        await expect(keystroke).toHaveClass(/expandRichHints/, { timeout: 2000 });

        // Both candidate suffixes ('g' for gg, 'd' for gd) should appear as kbd elements
        const kbds = keystroke.locator('kbd');
        await expect(kbds).toHaveCount(2, { timeout: 2000 });

        await page.waitForTimeout(150);
        await page.screenshot({ path: 'test-artifacts/results/scratch-popup-rich-hints.png' });
    });

    test('popup hides after Escape', async () => {
        const keystroke = page.frameLocator('iframe[src*="frontend.html"]').locator('#sk_keystroke');

        await page.keyboard.press('g');
        await expect(keystroke).toBeVisible({ timeout: 2000 });
        await page.waitForTimeout(150);
        await page.screenshot({ path: 'test-artifacts/results/scratch-popup-before-escape.png' });

        await page.keyboard.press('Escape');

        await expect(keystroke).toBeHidden({ timeout: 2000 });
        await page.screenshot({ path: 'test-artifacts/results/scratch-popup-after-escape.png' });
    });
});
