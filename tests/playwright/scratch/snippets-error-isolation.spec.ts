/**
 * Regression / canary test: an error thrown inside an api call in a user script
 * snippet must not abort subsequent api calls (fixed in src/user_scripts/index.ts).
 *
 * Previously, the entire user function `uf(api, settings)` ran inside a single
 * try/catch. When an api method threw mid-execution, the catch fired immediately
 * and all remaining api calls after the throw were never reached.
 *
 * Fix: a safeApi Proxy wraps each api method with an individual try/catch so that
 * a failure in one api call is isolated and subsequent calls proceed normally.
 *
 * This test:
 *   - Registers a snippet with a deliberate throw INSIDE an api call (api.mapkey
 *     called with null jscode → null.length throws) between two mapcmdkey calls
 *   - Asserts the BEFORE command is registered (always expected)
 *   - Asserts the AFTER command IS registered (confirms the bug is fixed)
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
    //   deliberate throw INSIDE an api call (api.mapkey with null jscode → null.length throws)
    //   cmd B: valid mapcmdkey AFTER the throw — must register because safeApi proxy isolates the error
    const snippetCode = `
        import(${JSON.stringify(absoluteApiUrl)}).then((module) => {
            module.default("chrome-extension://${extensionId}/", (api, settings) => {
                api.mapcmdkey('<F10>', 'cmd_scroll_down', {unique_id: 'test_before_error'});
                api.mapkey('t', 'broken call — null jscode causes null.length throw inside mapkey', null);
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
    // Bug fixed: safeApi proxy wraps each api method individually so a throw inside one
    // api call does not abort subsequent api calls. after_error must now be true.
    const afterResult = await invokeCommand(page, 'test_after_error');
    expect(
        afterResult,
        'mapping after error should be registered (bug fixed: safeApi proxy isolates per-call errors)',
    ).toBe(true);

    console.log(`before_error registered: ${beforeResult}`);
    console.log(`after_error registered:  ${afterResult} (true = bug fixed)`);

    await cov?.close();
    await context.close();
});
