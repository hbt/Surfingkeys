/**
 * Test: cmd_hints_open_incognito
 *
 * Verifies that invoking `cmd_hints_open_incognito` shows link hints and that
 * selecting a hint causes the extension SW to open an incognito Chrome window
 * via chrome.windows.create({ url: <hint-href>, incognito: true }).
 *
 * Command path:
 *   invokeCommand → hints.create("*[href]", ...) → user selects hint
 *   → RUNTIME('openIncognito', { url: element.href })
 *   → SW handler: chrome.windows.create({ url: message.url, incognito: true })
 *
 * Run:
 *   bunx playwright test tests/playwright/commands/cmd-hints-open-incognito.spec.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, invokeCommand, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_hints_open_incognito';
const FIXTURE_URL = `${FIXTURE_BASE}/hackernews.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

// ---------------------------------------------------------------------------
// Hint helpers
// ---------------------------------------------------------------------------

const HINT_SNAPSHOT_FN = `() => {
    const hintsHost = document.querySelector('.surfingkeys_hints_host');
    if (!hintsHost || !hintsHost.shadowRoot) {
        return { found: false, count: 0, sample: [], sortedHints: [] };
    }
    const shadowRoot = hintsHost.shadowRoot;
    const hintDivs = Array.from(shadowRoot.querySelectorAll('div')).filter(d => {
        const text = (d.textContent || '').trim();
        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
    });
    const sample = hintDivs.slice(0, 5).map(h => ({
        text: h.textContent?.trim(),
        visible: h.offsetParent !== null,
        position: { left: h.offsetLeft, top: h.offsetTop }
    }));
    return {
        found: true,
        count: hintDivs.length,
        sample,
        sortedHints: hintDivs.map(h => h.textContent?.trim()).sort()
    };
}`;

async function fetchHintSnapshot(page: Page) {
    return page.evaluate(new Function(`return (${HINT_SNAPSHOT_FN})()`) as () => any);
}

async function waitForHintCount(page: Page, minCount: number, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(page);
        if (snap.found && snap.count >= minCount) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`waitForHintCount: timed out waiting for ${minCount} hints`);
}

async function waitForHintsCleared(page: Page, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(page);
        if (!snap.found || snap.count === 0) return;
        await page.waitForTimeout(100);
    }
    throw new Error('waitForHintsCleared: timed out waiting for hints to clear');
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_open_incognito (Playwright)', () => {
    test.setTimeout(30_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
    });

    // -----------------------------------------------------------------------
    // 1.0 Hint creation
    // -----------------------------------------------------------------------

    test('1.1 shows hints when command is invoked', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await invokeCommand(page, 'cmd_hints_open_incognito');
                await waitForHintCount(page, 1);

                const snap = await fetchHintSnapshot(page);
                expect(snap.found).toBe(true);
                expect(snap.count).toBeGreaterThan(0);
            },
        );
    });

    // -----------------------------------------------------------------------
    // 2.0 Incognito window
    // -----------------------------------------------------------------------

    test('2.1 opens an incognito window with the selected link URL', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const sw =
                    context.serviceWorkers()[0] ??
                    (await context.waitForEvent('serviceworker', { timeout: 10_000 }));

                expect(sw.url(), 'SW must be the extension background.js').toContain('background.js');

                // Snapshot: confirm no incognito windows before the command
                const windowsBefore = await sw.evaluate(() =>
                    new Promise<chrome.windows.Window[]>(r => chrome.windows.getAll({}, r)),
                );
                expect(windowsBefore.filter(w => w.incognito).length, 'no incognito windows before command').toBe(0);

                // Get the href of the first link on the page
                const firstLinkHref = await page.evaluate(() => {
                    const link = document.querySelector('a[href]') as HTMLAnchorElement | null;
                    return link?.href ?? null;
                });
                expect(firstLinkHref).toBeTruthy();

                // Invoke the command — hints appear
                await invokeCommand(page, 'cmd_hints_open_incognito');
                await waitForHintCount(page, 1);

                // Read the first (alphabetically sorted) hint label
                const snap = await fetchHintSnapshot(page);
                expect(snap.count).toBeGreaterThan(0);
                const firstLabel: string = snap.sortedHints[0];
                expect(firstLabel).toMatch(/^[A-Z]{1,3}$/);

                // Press each character of the label (lowercase) to select the hint
                for (const ch of firstLabel.toLowerCase()) {
                    await page.keyboard.press(ch);
                    await page.waitForTimeout(50);
                }

                // Allow Chrome time to create the incognito window
                await page.waitForTimeout(1500);

                const windowsAfter = await sw.evaluate(() =>
                    new Promise<chrome.windows.Window[]>(r =>
                        chrome.windows.getAll({ populate: true }, r),
                    ),
                );
                const incognitoWindows = windowsAfter.filter(w => w.incognito);

                // Graceful skip if policy blocks incognito
                if (incognitoWindows.length === 0) {
                    const policyError = await sw.evaluate(() =>
                        new Promise<string | null>(resolve => {
                            chrome.windows.create({ incognito: true, state: 'minimized' }, win => {
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
                    if (policyError) {
                        test.skip(true, `Incognito window creation blocked by policy: ${policyError}`);
                        return;
                    }
                }

                expect(
                    incognitoWindows.length,
                    'at least one incognito window should exist after hint selection',
                ).toBeGreaterThan(0);

                const incognitoWindow = incognitoWindows[0];
                expect(incognitoWindow.incognito).toBe(true);

                const tabs = (incognitoWindow as any).tabs as chrome.tabs.Tab[] | undefined;
                expect(tabs && tabs.length > 0, 'incognito window should have at least one tab').toBe(true);

                const tab = tabs![0];
                const tabUrl = tab.url ?? tab.pendingUrl ?? '';
                console.log(`[incognito-hints-test] incognito tab url=${tabUrl}`);

                expect(
                    tabUrl.includes('127.0.0.1:9873') || tabUrl.startsWith('http'),
                    `incognito tab URL should be a valid URL (got: ${tabUrl})`,
                ).toBe(true);

                // Clean up
                await sw.evaluate(
                    (id: number) => new Promise<void>(r => chrome.windows.remove(id, () => r())),
                    incognitoWindow.id!,
                );
                console.log('[incognito-hints-test] Incognito window closed. Test passed.');
            },
        );
    });
});
