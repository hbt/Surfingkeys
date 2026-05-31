/**
 * Scratch test: domain-specific JS + CSS injection (chromedotfiles feature in MV3).
 *
 * The extension background script listens to chrome.tabs.onUpdated and on each
 * page load fetches domain-specific assets from the config server
 * (GET /domain-asset?host=<hostname>&type=js|css) and injects them via
 * chrome.scripting.executeScript / chrome.scripting.insertCSS.
 *
 * File lookup hierarchy mirrors chromedotfiles:
 *   127.0.0.1 → tries "127.0.0.1", "0.1", "1", then "default"
 *
 * Test fixtures (in data/fixtures/domain-assets/):
 *   127.0.0.1.js  — sets document.body.dataset['domainScriptLoaded'] = 'true'
 *   127.0.0.1.css — sets body outline to 3px solid pink
 *
 * Config server (port 9602) is started by playwright.scratch.config.ts with
 * DOMAIN_FILES_DIR=data/fixtures/domain-assets.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/domain-assets.spec.ts \
 *     --config=playwright.scratch.config.ts
 */
import { test, expect } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

test('domain-specific JS and CSS are injected for 127.0.0.1', async () => {
    const { context, cov } = await launchWithCoverage();

    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });

    // JS injection: 127.0.0.1.js sets this marker on body
    const jsInjected = await page.waitForFunction(
        () => document.body.dataset['domainScriptLoaded'] === 'true',
        { timeout: 5000 },
    ).then(() => true).catch(() => false);

    if (!jsInjected) {
        // SW may still be starting up — reload once
        if (DEBUG) console.log('\n[domain-assets] marker not seen on first load — reloading');
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(
            () => document.body.dataset['domainScriptLoaded'] === 'true',
            { timeout: 10000 },
        );
    }

    // Capture values before closing context
    const domainScriptLoaded = await page.evaluate(() => document.body.dataset['domainScriptLoaded']);
    const domainScriptHost   = await page.evaluate(() => document.body.dataset['domainScriptHost']);
    const outlineStyle       = await page.evaluate(() => window.getComputedStyle(document.body).outlineStyle);

    if (DEBUG) {
        console.log(`\n[domain-assets] domainScriptLoaded = ${domainScriptLoaded}`);
        console.log(`[domain-assets] domainScriptHost    = ${domainScriptHost}`);
        console.log(`[domain-assets] body outline-style  = ${outlineStyle}`);
    }

    await cov?.close();
    await context.close();

    expect(domainScriptLoaded, 'JS marker should be set by 127.0.0.1.js').toBe('true');
    expect(domainScriptHost,   'domainScriptHost should identify the injecting file').toBe('127.0.0.1');
    expect(outlineStyle,       'CSS outline from 127.0.0.1.css should be applied').toBe('solid');
});
