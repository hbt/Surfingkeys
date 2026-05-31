/**
 * Test: cmd_nav_new_incognito_window
 *
 * Verifies that invoking `cmd_nav_new_incognito_window` causes the extension
 * service worker to open an incognito Chrome window via
 * chrome.windows.create({ incognito: true }).
 *
 * The extension is pre-allowlisted for incognito via the Preferences file
 * written by launchExtensionContext (extensions.settings.<id>.incognito: true),
 * so the SW can observe incognito windows and tabs after creation.
 *
 * Command path:
 *   invokeCommand → content script __sk_invoke CustomEvent
 *   → RUNTIME('openNewIncognitoWindow')
 *   → SW handler: chrome.windows.create({ url: newTabUrl || 'chrome://newtab', incognito: true })
 *
 * Run:
 *   bunx playwright test tests/playwright/commands/cmd-nav-new-incognito-window.spec.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, invokeCommand, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const SUITE_LABEL = 'cmd_nav_new_incognito_window';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_nav_new_incognito_window (Playwright)', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'gtg', 'cmd_nav_new_incognito_window');
    });

    test('opens an incognito window', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const sw =
                    context.serviceWorkers()[0] ??
                    (await context.waitForEvent('serviceworker', { timeout: 10_000 }));

                expect(sw.url(), 'SW must be the extension background.js').toContain('background.js');

                // Snapshot: confirm no incognito windows exist before the command runs
                const windowsBefore = await sw.evaluate(() =>
                    new Promise<chrome.windows.Window[]>(r => chrome.windows.getAll({}, r)),
                );
                const incognitoBefore = windowsBefore.filter((w: chrome.windows.Window) => w.incognito);
                expect(incognitoBefore.length, 'no incognito windows should exist before command').toBe(0);

                // Invoke the command via the content-script bridge
                const invoked = await invokeCommand(page, 'cmd_nav_new_incognito_window');
                expect(invoked, 'invokeCommand must return true (bridge acknowledged)').toBe(true);

                // Allow Chrome time to create the incognito window
                await page.waitForTimeout(1500);

                // Query all windows and find the incognito one
                const windowsAfter = await sw.evaluate(() =>
                    new Promise<chrome.windows.Window[]>(r =>
                        chrome.windows.getAll({ populate: true }, r),
                    ),
                );

                const incognitoWindows = windowsAfter.filter((w: chrome.windows.Window) => w.incognito);

                // If incognito mode is blocked (policy/env), skip gracefully
                if (incognitoWindows.length === 0) {
                    const testError = await sw.evaluate(() =>
                        new Promise<string | null>(resolve => {
                            chrome.windows.create({ incognito: true, state: 'minimized' }, (win) => {
                                if (chrome.runtime.lastError) {
                                    resolve(chrome.runtime.lastError.message ?? 'unknown error');
                                } else {
                                    if (win?.id != null) {
                                        chrome.windows.remove(win.id, () => resolve(null));
                                    } else {
                                        resolve(null);
                                    }
                                }
                            });
                        }),
                    );
                    if (testError) {
                        test.skip(true, `Incognito window creation blocked by policy: ${testError}`);
                        return;
                    }
                }

                expect(
                    incognitoWindows.length,
                    'at least one incognito window should exist after invoking cmd_nav_new_incognito_window',
                ).toBeGreaterThan(0);

                const incognitoWindow = incognitoWindows[0];
                expect(incognitoWindow.incognito, 'window must have incognito=true').toBe(true);

                // Verify the SW can see at least one tab inside the incognito window
                // (possible because the extension is pre-allowlisted for incognito)
                const tabs = (incognitoWindow as any).tabs as chrome.tabs.Tab[] | undefined;
                expect(
                    tabs && tabs.length > 0,
                    'incognito window should have at least one tab visible to the SW',
                ).toBe(true);

                const tab = tabs![0];
                const tabUrl = tab.url ?? tab.pendingUrl ?? '';
                console.log(`[incognito-test] Created incognito window id=${incognitoWindow.id}, tab url=${tabUrl}`);

                // Clean up: close the incognito window via the SW
                await sw.evaluate(
                    (id: number) => new Promise<void>(r => chrome.windows.remove(id, () => r())),
                    incognitoWindow.id!,
                );
                console.log('[incognito-test] Incognito window closed. Test passed.');
            },
        );
    });
});
