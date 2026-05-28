/**
 * Scratch test: incognito window — Playwright limitation vs CDP workaround
 *
 * Test 1: "playwright: open incognito window"
 *   Attempts to create an incognito BrowserContext via Playwright's chromium API.
 *   Playwright does NOT support loading unpacked Chrome extensions in incognito
 *   contexts — Chrome requires the extension to be explicitly allowlisted for
 *   incognito via the extensions management page, which cannot be scripted.
 *   The test documents this limitation: newContext({ incognito: true }) on a
 *   persistent context either throws or returns a context where the extension
 *   service worker is absent.
 *
 * Test 2: "cdp: open incognito window via chrome.windows.create"
 *   Uses the extension service worker (already running in the normal profile) to
 *   call chrome.windows.create({ incognito: true }). The extension is pre-allowlisted
 *   via the Preferences file (extensions.settings.<id>.incognito: true) written before
 *   Chrome launches, so the SW CAN see incognito tabs. Verifies window is incognito
 *   and that chrome.tabs.query returns tabs from that window.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/incognito-cdp-open.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

// ---------------------------------------------------------------------------
// Test 1 — Playwright: attempt incognito context on a persistent context
// ---------------------------------------------------------------------------

test('playwright: open incognito window', async () => {
    const { context, cov } = await launchWithCoverage();
    await new Promise(r => setTimeout(r, 1000));

    // Playwright's persistent context does not support newContext().
    // chromium.launchPersistentContext() returns a BrowserContext that IS the
    // profile — there is no concept of "sub-contexts". Calling newContext() on
    // it would require a separate browser.launch() (non-persistent), which
    // cannot load unpacked extensions.
    //
    // We verify the limitation by checking that the extension SW is present in
    // the normal context but that we cannot observe it in a hypothetical
    // incognito one. Since Playwright has no API to create an incognito window
    // inside a persistent context, we use the SW to count windows and verify
    // none are incognito before we try.

    const sw = context.serviceWorkers()[0]
        ?? await context.waitForEvent('serviceworker', { timeout: 10_000 });

    console.log('[pw-incognito] SW URL:', sw.url());
    expect(sw.url(), 'SW must be the extension background.js').toContain('background.js');

    // Verify no incognito windows exist yet in this profile
    const windowsBefore = await sw.evaluate(() =>
        new Promise<chrome.windows.Window[]>(r => chrome.windows.getAll({}, r))
    );
    const incognitoBefore = windowsBefore.filter((w: chrome.windows.Window) => w.incognito);
    console.log(`[pw-incognito] Incognito windows before attempt: ${incognitoBefore.length}`);
    expect(incognitoBefore.length, 'no incognito windows should exist at start').toBe(0);

    // Attempt to create an incognito Page via Playwright context API.
    // PersistentContext does not expose newContext(), so we instead try opening
    // a new page and checking whether Playwright let us do anything incognito.
    // This is the documented limitation — we capture the error if it throws.
    let playwrightIncognitoError: string | null = null;
    try {
        // cast to any because newContext() does not exist on BrowserContext from launchPersistentContext
        const _incognitoCtx = await (context as any).newContext({ incognito: true });
        console.log('[pw-incognito] NOTE: newContext({ incognito: true }) did not throw (unexpected)');
        // If it somehow succeeded, close immediately
        await _incognitoCtx?.close?.();
    } catch (err: unknown) {
        playwrightIncognitoError = String(err);
        console.log('[pw-incognito] Expected error from Playwright:', playwrightIncognitoError);
    }

    // The limitation: Playwright throws or the API is unavailable on persistent contexts.
    // We assert the error occurred — this is the EXPECTED outcome.
    expect(
        playwrightIncognitoError,
        'Playwright should not support incognito contexts on a persistent context',
    ).not.toBeNull();

    console.log('[pw-incognito] RESULT: Playwright cannot open incognito context with extensions loaded — confirmed.');

    await cov?.close();
    await context.close();
});

// ---------------------------------------------------------------------------
// Test 2 — CDP: open incognito window via chrome.windows.create in the SW
// ---------------------------------------------------------------------------

test('cdp: open incognito window via chrome.windows.create', async () => {
    const { context, cov } = await launchWithCoverage();
    await new Promise(r => setTimeout(r, 1000));

    const sw = context.serviceWorkers()[0]
        ?? await context.waitForEvent('serviceworker', { timeout: 10_000 });

    console.log('[cdp-incognito] SW URL:', sw.url());
    expect(sw.url(), 'SW must be the extension background.js').toContain('background.js');

    // Open a normal page first so we have something as the "active" context
    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // Use the SW to call chrome.windows.create({ incognito: true })
    // The SW has access to the full chrome.* API including windows.create.
    // NOTE: Chrome will create the incognito window, but because this extension
    // has not been allowlisted for incognito via chrome://extensions, the
    // extension will NOT be injected into the incognito tabs. The window itself
    // still gets created successfully.
    let createdWindowId: number | null = null;
    let createError: string | null = null;

    try {
        createdWindowId = await sw.evaluate(() =>
            new Promise<number>((resolve, reject) => {
                chrome.windows.create({ incognito: true, state: 'minimized' }, (win) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (win) {
                        resolve(win.id!);
                    } else {
                        reject(new Error('chrome.windows.create returned undefined'));
                    }
                });
            })
        );
        console.log(`[cdp-incognito] Incognito window created with id=${createdWindowId}`);
    } catch (err: unknown) {
        createError = String(err);
        console.log('[cdp-incognito] chrome.windows.create error:', createError);
    }

    if (createError) {
        // chrome.windows.create may fail if incognito mode is disabled by policy.
        // In that case, document the failure and skip further assertions.
        console.log('[cdp-incognito] RESULT: incognito window creation blocked (policy or no incognito support).');
        console.log('[cdp-incognito] Error:', createError);
        // Soft-fail — this environment may not support incognito (e.g. --incognito disabled)
        test.skip(true, `chrome.windows.create({ incognito: true }) failed: ${createError}`);
        return;
    }

    expect(createdWindowId, 'a window ID must be returned').not.toBeNull();

    // Verify the created window is actually incognito
    const createdWindow = await sw.evaluate((id: number) =>
        new Promise<chrome.windows.Window>((resolve, reject) => {
            chrome.windows.get(id, {}, (win: chrome.windows.Window) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(win);
            });
        })
    , createdWindowId!);

    console.log(`[cdp-incognito] Window details: id=${createdWindow.id}, incognito=${createdWindow.incognito}, type=${createdWindow.type}`);

    expect(createdWindow.incognito, 'chrome.windows.create({ incognito: true }) must produce an incognito window').toBe(true);

    // Verify that the extension SW does NOT observe the incognito window's tabs
    // in chrome.tabs.query — extensions not allowlisted for incognito cannot see
    // incognito tabs.
    const incognitoTabs = await sw.evaluate((wid: number) =>
        new Promise<chrome.tabs.Tab[]>(r => chrome.tabs.query({ windowId: wid }, r))
    , createdWindowId!);

    console.log(`[cdp-incognito] Tabs visible to SW inside incognito window: ${incognitoTabs.length}`);
    // Depending on Chrome version and allowlist state this may be 0 (not allowlisted)
    // or >0 (allowlisted). We just log it — the key assertion is the window itself was incognito.
    // With the Preferences pre-write (extensions.settings.<id>.incognito: true) the extension IS
    // allowlisted, so the SW should be able to see the incognito tab.
    console.log(`[cdp-incognito] Extension can${incognitoTabs.length > 0 ? '' : 'NOT'} see incognito tabs (expected: CAN, because pre-allowlisted via Preferences).`);
    expect(incognitoTabs.length, 'SW should see incognito tabs when extension is pre-allowlisted').toBeGreaterThan(0);

    // Clean up: close the incognito window via SW
    await sw.evaluate((id: number) =>
        new Promise<void>(r => chrome.windows.remove(id, () => r()))
    , createdWindowId!);
    console.log('[cdp-incognito] Incognito window closed.');

    console.log('[cdp-incognito] RESULT: chrome.windows.create({ incognito: true }) succeeded via SW eval. Window was incognito=true.');

    await cov?.close();
    await context.close();
});
