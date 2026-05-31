/**
 * Scratch: screenshot with omnibar open (Playwright vs CDP)
 *
 * The omnibar is a chrome-extension:// iframe (iframe.sk_ui inside a shadow DOM).
 * Cross-origin iframes are typically NOT captured by page.screenshot() in headless Chrome.
 * This test confirms that and compares CDP fromSurface variants.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/omnibar-screenshot-playwright.spec.ts \
 *     --config=playwright.scratch.config.ts
 *
 * Inspect: test-artifacts/results/omnibar-screenshot-*.png
 */

import * as fs from 'fs';
import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

async function isOmnibarOpen(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const divs = document.querySelectorAll('div');
        for (const div of Array.from(divs)) {
            if (div.shadowRoot) {
                const iframe = div.shadowRoot.querySelector('iframe.sk_ui');
                if (iframe) {
                    const h = (iframe as HTMLElement).style.height;
                    return h !== '0px' && h !== '';
                }
            }
        }
        return false;
    });
}

async function waitForOmnibar(page: Page, open: boolean, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isOmnibarOpen(page) === open) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`waitForOmnibar(${open}): timed out`);
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

test('omnibar screenshot — Playwright vs CDP fromSurface variants', async () => {
    // Bind ':' to cmd_omnibar_commands
    await callSKApi(page, 'unmapAllExcept', []);
    await callSKApi(page, 'mapcmdkey', ':', 'cmd_omnibar_commands');
    await page.waitForTimeout(200);

    // Open omnibar
    await page.keyboard.press(':');
    await waitForOmnibar(page, true);
    await page.waitForTimeout(300); // let it fully render

    const open = await isOmnibarOpen(page);
    console.log(`[omnibar] isOmnibarOpen=${open}`);

    // 1. Playwright page.screenshot()
    const pwPath = 'test-artifacts/results/omnibar-screenshot-playwright.png';
    await page.screenshot({ path: pwPath });
    const pwSize = fs.statSync(pwPath).size;
    console.log(`[omnibar] playwright           → ${pwSize} bytes → ${pwPath}`);

    // Open a raw CDP session
    const cdp = await context.newCDPSession(page);

    // 2. CDP fromSurface: true
    const r1 = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true } as any);
    const s1 = savePng(r1.data, 'test-artifacts/results/omnibar-cdp-fromsurface-true.png');
    console.log(`[omnibar] cdp fromSurface=true  → ${s1} bytes`);

    // 3. CDP fromSurface: false
    const r2 = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false } as any);
    const s2 = savePng(r2.data, 'test-artifacts/results/omnibar-cdp-fromsurface-false.png');
    console.log(`[omnibar] cdp fromSurface=false → ${s2} bytes`);

    console.log('\n[omnibar] Summary:');
    console.log(`  playwright       : ${pwSize} bytes`);
    console.log(`  cdp fromSurface=true  : ${s1} bytes`);
    console.log(`  cdp fromSurface=false : ${s2} bytes`);
    console.log('\nOpen PNGs in test-artifacts/results/ — omnibar should be absent in page screenshots');
    console.log('but may appear in fromSurface=true if Chrome composites it onto the GPU surface.');

    expect(pwSize).toBeGreaterThan(1000);
    expect(s1).toBeGreaterThan(1000);
    expect(s2).toBeGreaterThan(1000);

    // Dismiss
    await page.keyboard.press('Escape');
});
