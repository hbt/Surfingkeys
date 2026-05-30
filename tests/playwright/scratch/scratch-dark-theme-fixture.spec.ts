/**
 * Scratch test: verify the dark-theme-test.html fixture is actually dark.
 *
 * Checks:
 *   1. body background-color is dark (luminance < 0.1)
 *   2. body color (text) is light (luminance > 0.5)
 *   3. color-scheme meta tag is "dark"
 *   4. html element has color-scheme: dark
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-dark-theme-fixture.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/dark-theme-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

/** Parse rgb(r, g, b) → relative luminance (0=black, 1=white) */
function relativeLuminance(rgb: string): number {
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return -1;
    const [r, g, b] = m.map(v => {
        const c = parseInt(v) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe('dark-theme-test.html fixture', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(300);
    });

    test.afterAll(async () => {
        await cov?.close();
        await context?.close();
    });

    test('body background-color is dark', async () => {
        const bg = await page.evaluate(() =>
            getComputedStyle(document.body).backgroundColor
        );
        console.log(`body background-color: ${bg}`);
        const lum = relativeLuminance(bg);
        console.log(`luminance: ${lum.toFixed(4)} (expected < 0.1)`);
        expect(lum).toBeGreaterThanOrEqual(0);
        expect(lum).toBeLessThan(0.1);
    });

    test('body text color is light', async () => {
        const color = await page.evaluate(() =>
            getComputedStyle(document.body).color
        );
        console.log(`body color: ${color}`);
        const lum = relativeLuminance(color);
        console.log(`luminance: ${lum.toFixed(4)} (expected > 0.5)`);
        expect(lum).toBeGreaterThan(0.5);
    });

    test('color-scheme meta tag is "dark"', async () => {
        const scheme = await page.evaluate(() => {
            const meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null;
            return meta?.content ?? null;
        });
        console.log(`color-scheme meta: ${scheme}`);
        expect(scheme).toBe('dark');
    });

    test('html element has color-scheme: dark', async () => {
        const scheme = await page.evaluate(() =>
            getComputedStyle(document.documentElement).colorScheme
        );
        console.log(`html color-scheme: ${scheme}`);
        expect(scheme).toBe('dark');
    });
});
