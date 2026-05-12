/**
 * Prove that absolute chrome-extension:// URLs work as dynamic import() specifiers
 * inside inline user scripts registered via chrome.userScripts.register().
 *
 * The extension's normal snippet pathway uses a relative import('./api.js').
 * This test registers a separate user script whose import specifier is the full
 * chrome-extension://<extensionId>/api.js URL — the form described in the goal.
 *
 * Success criteria:
 *   1. The absolute-URL import resolves (api.js module loads).
 *   2. A DOM dataset attribute is set by the user script callback.
 *   3. The existing fixture config pipeline is also intact (cmd marker invokable).
 *
 * Run:
 *   bunx playwright test tests/playwright/features/prove-absolute-url-import.spec.ts
 */
import { test, expect } from '@playwright/test';
import { launchWithCoverage, invokeCommand, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

// Attribute written by the absolute-URL import user script on success.
const ABSOLUTE_IMPORT_ATTR = 'absoluteImportWorked';

// Attribute written by the existing fixture config (data/fixtures/test-config-server.js).
const CONFIG_SERVER_ATTR = 'skConfigServerLoaded';

test('absolute chrome-extension:// URL works as dynamic import() in a user script', async () => {
    const { context, cov } = await launchWithCoverage();

    // Wait for SW to finish startup and snippet registration.
    await new Promise(r => setTimeout(r, 2000));

    // Derive extension ID from the service worker URL.
    const sw = context.serviceWorkers()[0]
        ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(sw.url()).hostname;
    const absoluteApiUrl = `chrome-extension://${extensionId}/api.js`;

    // Register a user script whose dynamic import uses the absolute chrome-extension:// URL.
    // On success it sets document.documentElement.dataset.absoluteImportWorked = 'true'.
    // On failure it sets it to the error message so the waitForFunction timeout gives useful info.
    await sw.evaluate((apiUrl: string) => {
        return new Promise<void>((resolve, reject) => {
            const code = `
                import(${JSON.stringify(apiUrl)}).then(() => {
                    document.documentElement.dataset.absoluteImportWorked = 'true';
                }).catch((err) => {
                    document.documentElement.dataset.absoluteImportWorked = 'error:' + String(err);
                });
            `;
            chrome.userScripts.register([{
                id: 'test-absolute-url-import',
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
    }, absoluteApiUrl);

    // Navigate to a fixture page so all user scripts run.
    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });

    // Wait for the absolute-URL import to resolve (or error out).
    // Timeout is generous to allow the dynamic import to complete.
    await page.waitForFunction(
        (attr: string) => (document.documentElement.dataset as any)[attr] !== undefined,
        ABSOLUTE_IMPORT_ATTR,
        { timeout: 10_000 },
    );

    const importResult = await page.evaluate(
        (attr: string) => (document.documentElement.dataset as any)[attr],
        ABSOLUTE_IMPORT_ATTR,
    );

    // 1. The absolute-URL import must have resolved without error.
    expect(
        importResult,
        `Expected absolute chrome-extension:// import to succeed; got: ${importResult}`,
    ).toBe('true');

    // 2. The existing fixture config pipeline must also be intact.
    //    data/fixtures/test-config-server.js sets skConfigServerLoaded and registers
    //    the cmd_config_server_test_marker command via the normal snippet pathway.
    const configServerLoaded = await page.evaluate(
        (attr: string) => (document.documentElement.dataset as any)[attr],
        CONFIG_SERVER_ATTR,
    );
    expect(
        configServerLoaded,
        'fixture config server snippet should have set skConfigServerLoaded',
    ).toBe('true');

    // 3. The fixture config marker command must be invokable (full pipeline check).
    const markerOk = await invokeCommand(page, 'cmd_config_server_test_marker');
    expect(markerOk, 'cmd_config_server_test_marker should be registered and invokable').toBe(true);

    await cov?.close();
    await context.close();
});
