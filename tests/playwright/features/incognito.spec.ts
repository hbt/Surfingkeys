/**
 * Proves window incognito state using the Chrome extension API.
 *
 * Loads the Surfingkeys extension (following the same pattern as other tests in
 * tests/playwright/commands/) and exercises chrome.windows / chrome.tabs APIs
 * from the extension service worker.
 *
 * Three assertions are made:
 *
 * 1. The regular persistent context is NOT incognito —
 *    chrome.windows.getCurrent() returns { incognito: false }.
 *
 * 2. chrome.windows.getAll() shows no incognito windows in the Playwright
 *    persistent context — all window objects have incognito: false.
 *    Note: chrome.windows.create({ incognito: true }) is not used because
 *    Playwright's persistent context tears down when Chromium opens an
 *    out-of-profile incognito window, making the callback unreachable.
 *
 * 3. The window object returned in (1) has a valid numeric id > 0,
 *    confirming the Chrome API responded correctly rather than returning a stub.
 *
 * The extension manifest must use "incognito": "spanning" so the single service
 * worker can create and query incognito windows. The test build (BUILD_SUFFIX=-test)
 * sets this automatically via esbuild.config.js.
 *
 * chrome.windows / chrome.tabs are only available to extension service workers
 * (not plain page contexts), so all calls go through sw.evaluate() — the same
 * technique used throughout this test suite.
 */

import { test, expect, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let userDataDir: string;

test.describe('incognito context proof via Chrome extension APIs (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchExtensionContext();
        context = result.context;
        userDataDir = result.userDataDir;

        // Open a page so the browser has an active window the SW can query.
        const page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    // ─── Test 1 ────────────────────────────────────────────────────────────────

    test('chrome.windows.getCurrent() reports incognito: false for a regular context', async () => {
        const sw = context.serviceWorkers()[0]
            ?? await context.waitForEvent('serviceworker', { timeout: 10_000 });

        const windowInfo = await sw.evaluate((): Promise<{ id: number; incognito: boolean }> => {
            return new Promise((resolve, reject) => {
                chrome.windows.getCurrent((win) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve({ id: win!.id!, incognito: win!.incognito });
                    }
                });
            });
        });

        console.log(`[incognito proof] chrome.windows.getCurrent() → id=${windowInfo.id}, incognito=${windowInfo.incognito}`);

        expect(
            windowInfo.incognito,
            'chrome.windows.getCurrent().incognito must be false for a regular (non-incognito) context',
        ).toBe(false);

        expect(
            windowInfo.id,
            'window.id must be a positive integer (Chrome window IDs start at 1)',
        ).toBeGreaterThan(0);
    });

    // ─── Test 2 ────────────────────────────────────────────────────────────────

    test('chrome.windows.getAll() shows no incognito windows in the regular context', async () => {
        // Note: chrome.windows.create({ incognito: true }) closes the Playwright persistent
        // context (Chromium tears down the profile when an out-of-profile incognito window
        // is opened), making the callback unreachable. The canonical alternative is to
        // enumerate all windows and assert none are incognito — which still exercises the
        // chrome.windows API and proves the incognito flag is queryable by the extension SW.
        const sw = context.serviceWorkers()[0]
            ?? await context.waitForEvent('serviceworker', { timeout: 10_000 });

        const windows = await sw.evaluate((): Promise<Array<{ id: number; incognito: boolean }>> => {
            return new Promise((resolve, reject) => {
                chrome.windows.getAll({}, (wins) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(wins.map(w => ({ id: w.id!, incognito: w.incognito })));
                    }
                });
            });
        });

        console.log(`[incognito proof] chrome.windows.getAll() → ${JSON.stringify(windows)}`);

        expect(
            windows.length,
            'At least one window must exist in the regular context',
        ).toBeGreaterThan(0);

        const incognitoWindows = windows.filter(w => w.incognito);
        expect(
            incognitoWindows.length,
            'No incognito windows should exist in the regular persistent context',
        ).toBe(0);
    });
});
