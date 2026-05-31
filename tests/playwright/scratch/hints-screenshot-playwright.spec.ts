/**
 * Scratch: Playwright screenshot with hints visible
 *
 * Confirms whether page.screenshot() captures extension-injected hint elements
 * (shadow DOM under .surfingkeys_hints_host) or not.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/hints-screenshot-playwright.spec.ts \
 *     --config=playwright.scratch.config.ts
 *
 * Inspect: test-artifacts/results/hints-screenshot-playwright.png
 */

import * as fs from 'fs';
import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/hackernews.html`;

const HINT_SNAPSHOT_FN = `() => {
    const hintsHost = document.querySelector('.surfingkeys_hints_host');
    if (!hintsHost || !hintsHost.shadowRoot) {
        return { found: false, count: 0, sample: [] };
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
    return { found: true, count: hintDivs.length, sample };
}`;

async function fetchHintSnapshot(page: Page) {
    return page.evaluate(new Function(`return (${HINT_SNAPSHOT_FN})()`) as () => any);
}

async function waitForHintCount(page: Page, minCount: number, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(page);
        if (snap.found && snap.count >= minCount) return snap;
        await page.waitForTimeout(100);
    }
    throw new Error(`waitForHintCount: timed out waiting for ${minCount} hints`);
}

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.beforeAll(async () => {
    const result = await launchWithCoverage();
    context = result.context;
    cov = result.cov;
    page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(800);
});

test.afterAll(async () => {
    await cov?.close();
    await context?.close();
});

test('playwright page.screenshot() with hints visible', async () => {
    // Bind 'f' to cmd_hints_open_link
    await callSKApi(page, 'unmapAllExcept', []);
    await callSKApi(page, 'mapcmdkey', 'f', 'cmd_hints_open_link');
    await page.waitForTimeout(200);

    // Trigger hints via key press
    await page.keyboard.press('f');
    const snap = await waitForHintCount(page, 1);
    console.log(`[hints-pw] DOM: found=${snap.found} count=${snap.count}`);
    console.log(`[hints-pw] sample:`, JSON.stringify(snap.sample, null, 2));

    // Take Playwright screenshot while hints are visible
    const outPath = 'test-artifacts/results/hints-screenshot-playwright.png';
    await page.screenshot({ path: outPath, fullPage: false });

    const stat = fs.statSync(outPath);
    console.log(`[hints-pw] Screenshot saved: ${outPath} (${stat.size} bytes)`);
    console.log('[hints-pw] Open the PNG to confirm if hints are visible in the screenshot.');

    expect(stat.size).toBeGreaterThan(1000);

    // Dismiss hints
    await page.keyboard.press('Escape');
});
