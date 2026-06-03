/**
 * Scratch: reproduce dispatchMouseEvent clientX/clientY=0 bug
 *
 * Root cause: surfingkeys' dispatchMouseEvent creates a MouseEvent with no
 * coordinates (clientX/clientY=0 by default). A SPA-like interceptor uses
 * document.elementFromPoint(clientX, clientY) to validate the click. When
 * the element is partially above the viewport, (0,0) doesn't map to it →
 * isOnTarget=false → SPA treats it as a current-tab navigation.
 *
 * This test simulates the exact MouseEvent surfingkeys dispatches (no coords)
 * and directly asserts the SPA interceptor behavior.
 *
 * Usage:
 *   bunx playwright test tests/playwright/scratch/scratch-gf-offscreen-viewport.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const SUITE_LABEL = 'scratch_gf_offscreen_viewport';
const FIXTURE_URL = `${FIXTURE_BASE}/scratch-spa-link-offscreen.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

// Simulate exactly what surfingkeys' dispatchMouseEvent does
// mode: 'no-coords' = bug (clientX/Y=0), 'real-coords' = after fix
async function simulateSKClick(p: Page, mode: 'no-coords' | 'real-coords') {
    return p.evaluate((m) => {
        const el = document.getElementById('spa-link')!;
        const rect = el.getBoundingClientRect();
        const MOUSE_EVENTS = ['mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        MOUSE_EVENTS.forEach(eventName => {
            const init: MouseEventInit = {
                bubbles: true, cancelable: true, composed: true,
                view: window, ctrlKey: true,
            };
            if (m === 'real-coords') {
                init.clientX = rect.left + rect.width / 2;
                init.clientY = rect.top + rect.height / 2;
            }
            el.dispatchEvent(new MouseEvent(eventName, init));
        });
    }, mode);
}

async function getStatus(p: Page) {
    return p.evaluate(() => document.getElementById('status')!.textContent!);
}

async function resetStatus(p: Page) {
    await p.evaluate(() => { document.getElementById('status')!.textContent = 'status: waiting'; });
}

function getPages() { return context.pages(); }

async function closeExtraPages(fixturePage: Page) {
    for (const p of getPages()) {
        if (p !== fixturePage) { try { await p.close(); } catch (_) {} }
    }
}

test.describe('scratch: dispatchMouseEvent coords=0 bug (SPA viewport mismatch)', () => {
    test.setTimeout(30_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
        await resetStatus(page);
        await closeExtraPages(page);
    });

    test.afterAll(async () => {
        try { await covBg?.close(); await context?.close(); } catch (_) {}
    });

    // -----------------------------------------------------------------------
    // 1.0 Element in viewport — real coords succeed, no-coords also succeed
    // -----------------------------------------------------------------------

    test('1.1 element in viewport: coords=(0,0) → isOnTarget check', async () => {
        const top = await page.evaluate(() =>
            document.getElementById('spa-link')!.getBoundingClientRect().top
        );
        expect(top).toBeGreaterThanOrEqual(0);
        console.log('[1.1] link top (in viewport):', top);

        await simulateSKClick(page, 'no-coords');
        const status = await getStatus(page);
        console.log('[1.1] status:', status);

        // At (0,0), elementFromPoint returns whatever is at the top-left corner.
        // Link is in the viewport but not at (0,0) → may or may not be on-target
        // depending on scroll position. Key: the test documents the behavior.
        expect(status).toContain('ctrlKey=true');
        expect(status).toContain('coords=(0,0)');
    });

    // -----------------------------------------------------------------------
    // 2.0 Element partially above viewport — the bug scenario
    // -----------------------------------------------------------------------

    test('2.1 element partially above viewport: no-coords → isOnTarget=false (BUG)', async () => {
        // Scroll so link is ~10px above viewport top
        await page.evaluate(() => {
            const link = document.getElementById('spa-link')!;
            const rect = link.getBoundingClientRect();
            window.scrollBy(0, rect.top + 10);
        });

        const top = await page.evaluate(() =>
            document.getElementById('spa-link')!.getBoundingClientRect().top
        );
        console.log('[2.1] link top after scroll:', top);
        expect(top).toBeLessThan(0); // confirm partially above viewport

        await simulateSKClick(page, 'no-coords');
        const status = await getStatus(page);
        console.log('[2.1] status:', status);

        // BUG: coords=(0,0) → elementFromPoint(0,0) is NOT the link → isOnTarget=false
        expect(status).toContain('coords=(0,0)');
        expect(status).toContain('isOnTarget=false');
        expect(status).toContain('bug: current-tab');
    });

    test('2.2 element partially above viewport: real-coords → isOnTarget=true (FIXED)', async () => {
        // Scroll so link is ~10px above viewport top
        await page.evaluate(() => {
            const link = document.getElementById('spa-link')!;
            const rect = link.getBoundingClientRect();
            window.scrollBy(0, rect.top + 10);
        });

        const top = await page.evaluate(() =>
            document.getElementById('spa-link')!.getBoundingClientRect().top
        );
        console.log('[2.2] link top after scroll:', top);
        expect(top).toBeLessThan(0); // confirm partially above viewport

        const initialCount = getPages().length;
        await simulateSKClick(page, 'real-coords');
        const status = await getStatus(page);
        console.log('[2.2] status:', status);

        // FIX: real coords → elementFromPoint hits the link → isOnTarget=true → new tab
        expect(status).toContain('isOnTarget=true');
        expect(status).toContain('new-tab');

        // Verify new tab was actually opened
        await new Promise(r => setTimeout(r, 500));
        expect(getPages().length).toBe(initialCount + 1);
    });
});
