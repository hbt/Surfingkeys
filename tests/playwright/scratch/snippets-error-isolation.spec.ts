/**
 * Regression / canary test: a throw inside a user script snippet aborts all
 * subsequent mapcmdkey calls (bug in src/user_scripts/index.ts:320–329).
 *
 * The entire user function `uf(api, settings)` runs inside a single try/catch.
 * When an error is thrown mid-execution the catch fires immediately and all
 * remaining api.mapcmdkey() calls after the throw are never reached.
 *
 * This test:
 *   - Registers a snippet with a deliberate throw between two mapcmdkey calls
 *   - Asserts the BEFORE command is registered (always expected)
 *   - Asserts the AFTER command is NOT registered (confirms the bug is present)
 *
 * When the bug is fixed, the AFTER assertion must be flipped to toBe(true).
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/snippets-error-isolation.spec.ts \
 *     --config=playwright.scratch.config.ts
 */
import { test, expect } from '@playwright/test';
import { launchWithCoverage, invokeCommand, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

test('snippet error should not prevent subsequent mapkey registrations', async () => {
    const { context, cov } = await launchWithCoverage();

    // Wait for SW to finish startup and snippet registration.
    await new Promise(r => setTimeout(r, 2000));

    // Derive extension ID from the service worker URL.
    const sw = context.serviceWorkers()[0]
        ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(sw.url()).hostname;
    const absoluteApiUrl = `chrome-extension://${extensionId}/api.js`;

    // Unregister any pre-existing snippet with this id to avoid conflicts across retries.
    await sw.evaluate(() => new Promise<void>(r =>
        chrome.userScripts.unregister({ ids: ['test-error-isolation'] }, () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            chrome.runtime.lastError; // consume potential "not registered" error
            r();
        })
    )).catch(() => {});
    await new Promise(r => setTimeout(r, 200));

    // Register a broken snippet:
    //   cmd A: valid mapcmdkey BEFORE the deliberate throw
    //   deliberate throw (accessing property on undefined)
    //   cmd B: valid mapcmdkey AFTER the throw — should register if error isolation worked
    const snippetCode = `
        import(${JSON.stringify(absoluteApiUrl)}).then((module) => {
            module.default("chrome-extension://${extensionId}/", (api, settings) => {
                api.mapcmdkey('<F10>', 'cmd_scroll_down', {unique_id: 'test_before_error'});
                (undefined).deliberate_throw_to_test_isolation;
                api.mapcmdkey('<F11>', 'cmd_scroll_up', {unique_id: 'test_after_error'});
            });
        }).catch((err) => {
            document.documentElement.dataset.snippetLoadError = String(err);
        });
    `;

    await sw.evaluate(([id, code]: [string, string]) => new Promise<void>((resolve, reject) =>
        chrome.userScripts.register([{
            id,
            allFrames: false,
            matches: ['*://*/*'],
            js: [{ code }],
        }], () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
        })
    ), ['test-error-isolation', snippetCode] as [string, string]);

    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });

    // Wait for SK content script invoke bridge to be ready.
    await page.waitForFunction(
        () => (document.documentElement.dataset as any).skInvokeReady === 'true',
        { timeout: 10_000 }
    );

    // Extra wait for the async user script import chain to resolve.
    await page.waitForTimeout(2000);

    // --- Assertion A: command BEFORE the throw must always be registered ---
    const beforeResult = await invokeCommand(page, 'test_before_error');
    expect(beforeResult, 'mapping before error should be registered').toBe(true);

    // --- Assertion B: command AFTER the throw ---
    // BUG: currently false because the single try/catch in index.ts aborts on the throw.
    // When the bug is fixed (per-snippet error isolation), this must be flipped to toBe(true).
    const afterResult = await invokeCommand(page, 'test_after_error');
    expect(
        afterResult,
        'mapping after error should NOT be registered (BUG confirmed: false = single try/catch aborts remaining calls)',
    ).toBe(false);

    console.log(`before_error registered: ${beforeResult}`);
    console.log(`after_error registered:  ${afterResult} (false = bug confirmed)`);

    await cov?.close();
    await context.close();
});
