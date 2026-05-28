/**
 * Scratch test: SW restart loses snippet settings (regression / bug demonstration)
 *
 * Bug: updateSettings({ scope: 'snippets' }) writes into in-memory `conf` but does NOT
 * persist to storage. On SW restart, `conf` is re-initialized from hard-coded defaults
 * and the snippets-set value evaporates silently.
 *
 * Setting under test: `newTabPosition` (default 'right', set to 'first')
 *
 * Observable proxy: dispatch `openLink` with tab:true through __CDP_MESSAGE_BRIDGE__
 * which calls openUrlInNewTab(activeTab, url, message) — the same code path that reads
 * conf.newTabPosition. The active tab is NOT at index 0 so 'first' vs 'right' is
 * clearly distinguishable by tab index.
 *
 * The final assertion is written as "should be true if bug were fixed" — it is
 * EXPECTED TO FAIL, demonstrating the bug.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/sw-restart-loses-settings.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
// A distinct URL so we can identify the newly opened tab
const NEW_TAB_URL = `${FIXTURE_BASE}/hints-test.html`;

test.describe('SW restart loses snippet settings', () => {
    test.setTimeout(30_000);

    test('newTabPosition set via snippets reverts to default after SW restart', async () => {
        const { context, cov } = await launchWithCoverage();
        await new Promise(r => setTimeout(r, 1000));

        let sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

        // 1. Open fixture page — this becomes the active tab
        const page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        // 2. Set newTabPosition = 'first' via snippets scope (in-memory only — the bug)
        await sw.evaluate(() => {
            (globalThis as any).__CDP_MESSAGE_BRIDGE__.dispatch('updateSettings', {
                scope: 'snippets',
                settings: { newTabPosition: 'first' },
            });
        });
        await page.waitForTimeout(200);

        // Helper: open NEW_TAB_URL via openLink (goes through conf.newTabPosition)
        // CDP bridge sender has no tab, so openLink falls through to getActiveTab()
        async function openViaOpenLink(swHandle: Awaited<ReturnType<typeof context.serviceWorkers>>[0]) {
            const tabsBefore = await swHandle.evaluate(() => new Promise<any[]>(r =>
                chrome.tabs.query({ currentWindow: true }, r)
            ));
            const idsBefore = new Set(tabsBefore.map((t: any) => t.id));

            const newPagePromise = context.waitForEvent('page');
            await swHandle.evaluate((url: string) => {
                (globalThis as any).__CDP_MESSAGE_BRIDGE__.dispatch('openLink', {
                    url,
                    tab: { tabbed: true, active: false },
                });
            }, NEW_TAB_URL);
            const newTabPage = await newPagePromise;
            await newTabPage.waitForLoadState('domcontentloaded').catch(() => {});
            await new Promise(r => setTimeout(r, 400));

            const tabsAfter = await swHandle.evaluate(() => new Promise<any[]>(r =>
                chrome.tabs.query({ currentWindow: true }, r)
            ));
            const newTab = tabsAfter.find((t: any) => !idsBefore.has(t.id));
            return { newTab, allTabs: tabsAfter, newTabPage };
        }

        // 3. Verify 'first' is active pre-restart: new tab should land at index 0
        const pre = await openViaOpenLink(sw);
        console.log(`[pre-restart] newTabPosition='first' set. New tab index=${pre.newTab?.index}`);
        console.log(`[pre-restart] All tabs: ${pre.allTabs.map((t: any) => `[${t.index}] ${t.url}`).join(', ')}`);
        expect(pre.newTab?.index, 'pre-restart: tab should be at index 0 (first)').toBe(0);
        await pre.newTabPage.close();
        await page.waitForTimeout(200);

        // 4. Also verify storage does NOT have 'first' — the bug means it was never persisted
        const storedBeforeRestart = await sw.evaluate(() => new Promise<any>(r =>
            chrome.storage.local.get('newTabPosition', r)
        ));
        console.log(`[pre-restart] chrome.storage.local.newTabPosition = ${JSON.stringify(storedBeforeRestart.newTabPosition)} (should be undefined or 'right', NOT 'first')`);

        // 5. Trigger SW restart — set up listener FIRST
        const newSwPromise = context.waitForEvent('serviceworker', { timeout: 10_000 });
        await sw.evaluate(() => {
            (globalThis as any).__CDP_MESSAGE_BRIDGE__.dispatch('cdpReloadExtension', {});
        }).catch(() => {});  // SW dies mid-call, suppress error
        const newSw = await newSwPromise;
        await page.waitForTimeout(1500);  // let loadSettings() complete

        console.log('[post-restart] New SW registered:', newSw.url());

        // 6. Open another tab with the new SW — check its position
        const post = await openViaOpenLink(newSw);
        console.log(`[post-restart] New tab index=${post.newTab?.index}`);
        console.log(`[post-restart] All tabs: ${post.allTabs.map((t: any) => `[${t.index}] ${t.url}`).join(', ')}`);

        // Also read storage after restart for completeness
        const storedAfterRestart = await newSw.evaluate(() => new Promise<any>(r =>
            chrome.storage.local.get('newTabPosition', r)
        ));
        console.log(`[post-restart] chrome.storage.local.newTabPosition = ${JSON.stringify(storedAfterRestart.newTabPosition)}`);

        // BUG: after restart, newTabPosition reverted to 'right' (default).
        // So the new tab lands at activeTab.index + 1, NOT at index 0.
        // This assertion is written as "should be true if bug were fixed" —
        // it FAILS demonstrating the bug.
        expect(
            post.newTab?.index,
            'post-restart: tab should still be at index 0 (BUG: newTabPosition reverts to right after SW restart)',
        ).toBe(0);

        await post.newTabPage.close();
        await cov?.close();
        await context.close();
    });
});
