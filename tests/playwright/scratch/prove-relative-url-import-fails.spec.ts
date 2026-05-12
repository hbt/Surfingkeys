/**
 * Proves that relative `./api.js` URLs FAIL for dynamic imports inside inline
 * user scripts registered via chrome.userScripts.register().
 *
 * When a user script is registered with js:[{code:'...'}] (inline code, no
 * file URL), Chrome has no extension base URL to resolve relative specifiers
 * against. The runtime falls back to the page origin, so `import('./api.js')`
 * becomes `http://[page-origin]/api.js` which 404s. The .then() callback
 * never fires, and the DOM marker is never written.
 *
 * Contrast with the WORKING pattern used in buildSettingsSnippetCode()
 * (src/background/start.js) which injects an absolute chrome-extension:// URL:
 *   import('chrome-extension://<id>/api.js').then(...)
 *
 * This test is the counterpart of prove-absolute-url-import.spec.ts which
 * proves the absolute-URL form succeeds.
 *
 * Strategy (Option D — SW evaluate):
 *   1. Launch the extension and wait for the SW to start.
 *   2. Evaluate JS in the SW to register a probe user script whose inline code
 *      does:  import('./api.js').then(() => { dataset.marker = 'true' })
 *   3. Navigate to a fixture page. Chrome resolves the import against the page
 *      origin (http://127.0.0.1:9873/api.js) — that path does not exist → 404.
 *   4. Wait 3 s. Assert the DOM marker attribute is ABSENT (null), proving the
 *      .then() callback never executed.
 *
 * Run:
 *   bunx playwright test tests/playwright/features/prove-relative-url-import-fails.spec.ts
 */
import { test, expect } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

// Attribute the probe script would write if the import succeeded.
const MARKER_ATTR = 'testRelativeImportWorked';

test('relative ./api.js import in inline user script silently fails — DOM marker is never set', async () => {
    const { context, cov } = await launchWithCoverage();

    // Wait for SW to finish startup and snippet registration.
    await new Promise(r => setTimeout(r, 2000));

    // Obtain the SW handle (same pattern as prove-absolute-url-import.spec.ts).
    const sw = context.serviceWorkers()[0]
        ?? await context.waitForEvent('serviceworker');

    // Register a probe user script with a RELATIVE import specifier.
    // If the import resolves, the dataset attribute is written.
    // If the import 404s (expected), the .then() never fires — no attribute.
    // Note: no catch() branch writes to the marker so that both silent-404 and
    // thrown-error failure modes map to the same observable outcome (absent attr).
    await sw.evaluate(() => {
        return new Promise<void>((resolve, reject) => {
            const code = `
                import('./api.js').then(() => {
                    document.documentElement.dataset.testRelativeImportWorked = 'true';
                });
            `;
            chrome.userScripts.register([{
                id: 'test-relative-url-import-probe',
                allFrames: false,
                matches: ['*://*/*'],
                js: [{ code }],
            }], () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    });

    // Navigate to a fixture page so the probe user script runs.
    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });

    // Give async import resolution enough time — if it were going to succeed it
    // would do so in well under 3 s on localhost (the absolute-URL form does).
    await page.waitForTimeout(3000);

    // The DOM marker MUST NOT be present. Its absence proves the relative
    // import silently failed (404) and the .then() callback never executed.
    const markerValue = await page.evaluate(
        (attr: string) => (document.documentElement.dataset as any)[attr] ?? null,
        MARKER_ATTR,
    );

    expect(
        markerValue,
        'Relative ./api.js import must NOT succeed in an inline user script — ' +
        'the DOM marker should be null. If it is "true", the import unexpectedly ' +
        'resolved against the page origin (which should not have api.js).',
    ).toBeNull();

    await cov?.close();
    await context.close();
});
