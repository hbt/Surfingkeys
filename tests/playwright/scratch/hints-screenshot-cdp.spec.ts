/**
 * Scratch: CDP direct Page.captureScreenshot with hints visible
 *
 * Compares 3 CDP screenshot variants vs Playwright's page.screenshot() to see
 * if extension-injected hints (shadow DOM) appear in any of them.
 *
 *   fromSurface: true  → captures from the GPU compositor surface ("what's on screen")
 *   fromSurface: false → uses offscreen rendering pipeline
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/hints-screenshot-cdp.spec.ts \
 *     --config=playwright.scratch.config.ts
 *
 * Inspect:
 *   test-artifacts/results/hints-cdp-fromsurface-true.png
 *   test-artifacts/results/hints-cdp-fromsurface-false.png
 *   test-artifacts/results/hints-cdp-beyondviewport.png
 *   test-artifacts/results/hints-screenshot-playwright.png  (baseline)
 */

import * as fs from 'fs';
import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
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
    const sample = hintDivs.slice(0, 3).map(h => ({
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

function savePng(base64: string, outPath: string): number {
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(outPath, buf);
    return buf.byteLength;
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

test('CDP Page.captureScreenshot variants with hints visible', async () => {
    // Bind 'f' to cmd_hints_open_link
    await callSKApi(page, 'unmapAllExcept', []);
    await callSKApi(page, 'mapcmdkey', 'f', 'cmd_hints_open_link');
    await page.waitForTimeout(200);

    // Trigger hints
    await page.keyboard.press('f');
    const snap = await waitForHintCount(page, 1);
    console.log(`[hints-cdp] DOM: found=${snap.found} count=${snap.count}`);
    console.log(`[hints-cdp] sample:`, JSON.stringify(snap.sample, null, 2));

    // Open a raw CDP session on this page
    const cdp = await context.newCDPSession(page);

    // 1. fromSurface: true (GPU compositor — "what you'd see on screen")
    const r1 = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true } as any);
    const s1 = savePng(r1.data, 'test-artifacts/results/hints-cdp-fromsurface-true.png');
    console.log(`[hints-cdp] fromSurface=true  → ${s1} bytes`);

    // 2. fromSurface: false (offscreen rendering pipeline)
    const r2 = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false } as any);
    const s2 = savePng(r2.data, 'test-artifacts/results/hints-cdp-fromsurface-false.png');
    console.log(`[hints-cdp] fromSurface=false → ${s2} bytes`);

    // 3. captureBeyondViewport + fromSurface: true
    const r3 = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
    } as any);
    const s3 = savePng(r3.data, 'test-artifacts/results/hints-cdp-beyondviewport.png');
    console.log(`[hints-cdp] fromSurface=true+beyondViewport → ${s3} bytes`);

    // 4. Playwright baseline for easy visual comparison
    await page.screenshot({ path: 'test-artifacts/results/hints-cdp-baseline-playwright.png' });
    const s4 = fs.statSync('test-artifacts/results/hints-cdp-baseline-playwright.png').size;
    console.log(`[hints-cdp] playwright baseline → ${s4} bytes`);

    console.log('\n[hints-cdp] Summary:');
    console.log(`  fromSurface=true  : ${s1} bytes`);
    console.log(`  fromSurface=false : ${s2} bytes`);
    console.log(`  beyondViewport    : ${s3} bytes`);
    console.log(`  pw baseline       : ${s4} bytes`);
    console.log('Open the PNGs in test-artifacts/results/ to compare hint visibility.');

    expect(s1).toBeGreaterThan(1000);
    expect(s2).toBeGreaterThan(1000);
    expect(s3).toBeGreaterThan(1000);

    // Dismiss hints
    await page.keyboard.press('Escape');
});
