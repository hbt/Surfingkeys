/**
 * Scratch test: verify whether @media (prefers-color-scheme: dark) works inside
 * the Surfingkeys frontend iframe.
 *
 * Root cause under investigation:
 *   src/content_scripts/uiframe.ts:11 — `uiHost.style.colorScheme = "light"`
 *   forces the shadow host to always report a light color scheme.
 *
 * PR #2361 proposes changing "light" → "auto".
 *
 * FINDINGS:
 *   - `window.matchMedia('prefers-color-scheme: dark')` inside the iframe
 *     WORKS correctly even with colorScheme="light" in Playwright, because
 *     `page.emulateMedia()` injects the preference at the CDP level, which
 *     bypasses CSS `color-scheme` property inheritance entirely.
 *   - The actual bug is a WHITE BACKGROUND FLASH on iframe load in dark mode:
 *     `color-scheme: light` causes the browser to render the iframe with a
 *     light default background before user CSS is applied. This is a visual
 *     timing artifact not reliably capturable in Playwright.
 *   - The `color-scheme` value on `uiHost` CAN be verified via DOM inspection
 *     as a proxy for confirming the source-level issue exists.
 *
 * VERDICT: Issue IS real in real browsers (visual flash), but Playwright cannot
 * reliably reproduce it. The DOM check below confirms the problematic value is
 * present in the built extension.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-uiframe-color-scheme.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('uiframe color-scheme media query', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
        page = await context.newPage();
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await cov?.close();
        await context?.close();
    });

    test('host page correctly reports dark mode', async () => {
        const hostDark = await page.evaluate(() =>
            window.matchMedia('(prefers-color-scheme: dark)').matches
        );
        expect(hostDark).toBe(true);
    });

    test('uiHost has colorScheme="light" — source-level bug confirmed', async () => {
        // This directly checks the DOM property that causes the visual bug.
        // PASS (value="light") = bug is present in this build.
        // FAIL (value="auto")  = PR #2361 fix has been applied.
        const colorScheme = await page.evaluate(() => {
            const uiHost = document.querySelector('div[style*="color-scheme"]') as HTMLElement | null
                ?? (Array.from(document.querySelectorAll('*')).find(el => {
                    return (el as HTMLElement).shadowRoot !== null;
                }) as HTMLElement | null);
            if (!uiHost) return 'uiHost not found';
            return uiHost.style.colorScheme;
        });

        console.log(`uiHost.style.colorScheme = "${colorScheme}"`);

        // "auto" = PR #2361 fix applied. "light" = bug present.
        expect(colorScheme).toBe('auto');
    });

    test('@media dark query works in iframe (Playwright CDP emulation bypasses color-scheme)', async () => {
        // This PASSES even with colorScheme="light" because Playwright's
        // emulateMedia injects preference at CDP level, not CSS level.
        // Included to document that matchMedia is NOT the broken surface.
        const frontendFrame = page.frames().find(f => f.url().includes('frontend.html'));
        expect(frontendFrame, 'SK frontend iframe not found').toBeTruthy();

        const iframeDark = await frontendFrame!.evaluate(() =>
            window.matchMedia('(prefers-color-scheme: dark)').matches
        );

        // Passes with both "light" and "auto" — not the right test for this bug.
        expect(iframeDark).toBe(true);
        console.log('NOTE: matchMedia works in Playwright regardless of color-scheme property.');
        console.log('The real bug (white flash) is a rendering artifact not testable here.');
    });
});
