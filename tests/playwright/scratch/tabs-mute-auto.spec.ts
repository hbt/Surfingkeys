/**
 * Scratch test: tabsMuteAll auto-mute on tab load
 *
 * Verifies that:
 *   1. tabsMuteAll=true → newly loaded HTTP tabs are muted before audio can play
 *   2. tabsMuteAll=true + tabsMuteExceptions=['127.0.0.1'] → fixture tabs are NOT muted
 *   3. tabsMuteAll=false (default) → no auto-mute
 *
 * Mechanism:
 *   - Uses __CDP_MESSAGE_BRIDGE__ to call updateSettings({scope:'snippets'}) directly in the SW,
 *     which writes into the in-memory `conf` object (same path as the user's config file).
 *   - Navigates a new tab to a fixture HTTP URL.
 *   - Reads mutedInfo.muted via chrome.tabs.get() from the SW after page load.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/tabs-mute-auto.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL   = `${FIXTURE_BASE}/scroll-test.html`;
const FIXTURE_URL_2 = `${FIXTURE_BASE}/hints-test.html`;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function setMuteConf(sw: any, tabsMuteAll: boolean, tabsMuteExceptions: string[]): Promise<void> {
    await sw.evaluate(({ all, exc }: { all: boolean; exc: string[] }) => {
        (globalThis as any).__CDP_MESSAGE_BRIDGE__.dispatch('updateSettings', {
            scope: 'snippets',
            settings: { tabsMuteAll: all, tabsMuteExceptions: exc },
        });
    }, { all: tabsMuteAll, exc: tabsMuteExceptions });
    // brief settle so conf is updated before any navigation
    await new Promise(r => setTimeout(r, 150));
}

/** Read tabsMuteAll from chrome.storage.local — written by updateSettings when scope='snippets'. */
async function getStoredMuteAll(sw: any): Promise<boolean | undefined> {
    return sw.evaluate(() =>
        new Promise<boolean | undefined>(resolve =>
            chrome.storage.local.get('tabsMuteAll', (r: any) => resolve(r.tabsMuteAll))
        )
    );
}

async function getTabMuted(sw: any, tabId: number): Promise<boolean> {
    return sw.evaluate((id: number) =>
        new Promise<boolean>(resolve =>
            chrome.tabs.get(id, (tab: any) => resolve(tab?.mutedInfo?.muted ?? false))
        )
    , tabId);
}

/** Open a new tab, navigate to url, return its Chrome tab ID. */
async function openTab(context: BrowserContext, sw: any, url: string): Promise<{ page: any; tabId: number }> {
    // Snapshot existing IDs before opening
    const idsBefore: number[] = await sw.evaluate(() =>
        new Promise<number[]>(resolve =>
            chrome.tabs.query({}, (tabs: any[]) => resolve(tabs.map((t: any) => t.id)))
        )
    );

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    // onUpdated('loading') fires during navigation — by 'load' the mute should already be applied.
    await page.waitForTimeout(300);

    const tabId: number = await sw.evaluate((before: number[]) =>
        new Promise<number>(resolve =>
            chrome.tabs.query({}, (tabs: any[]) => {
                const t = tabs.find((x: any) => !before.includes(x.id));
                resolve(t?.id ?? -1);
            })
        )
    , idsBefore);

    return { page, tabId };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('tabsMuteAll: auto-mute on tab load', () => {
    test.setTimeout(25_000);

    test('tab is muted when tabsMuteAll=true and no exceptions', async () => {
        let cov: ServiceWorkerCoverage | undefined;
        let context: BrowserContext | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            // Seed a base page so the extension is active
            const basePage = await context.newPage();
            await basePage.goto(FIXTURE_URL, { waitUntil: 'load' });
            await basePage.waitForTimeout(500);

            // Enable auto-mute with no exceptions
            await setMuteConf(sw, true, []);
            expect(await getStoredMuteAll(sw), 'conf.tabsMuteAll must be true before navigation').toBe(true);

            // Open a new tab to a fixture HTTP URL
            const { page: newPage, tabId } = await openTab(context, sw, FIXTURE_URL_2);
            console.log(`[mute-all] tabId=${tabId}`);
            expect(tabId, 'should have found a valid tab ID').toBeGreaterThan(0);

            const muted = await getTabMuted(sw, tabId);
            console.log(`[mute-all] mutedInfo.muted=${muted}`);
            expect(muted, 'tab should be auto-muted on load').toBe(true);

            await newPage.close();
        } finally {
            await cov?.close();
            await context?.close();
        }
    });

    test('excepted domain is not muted', async () => {
        let cov: ServiceWorkerCoverage | undefined;
        let context: BrowserContext | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            const basePage = await context.newPage();
            await basePage.goto(FIXTURE_URL, { waitUntil: 'load' });
            await basePage.waitForTimeout(500);

            // Enable auto-mute but except fixture server hostname (127.0.0.1)
            await setMuteConf(sw, true, ['127.0.0.1']);
            expect(await getStoredMuteAll(sw), 'conf.tabsMuteAll must be true before navigation').toBe(true);

            const { page: newPage, tabId } = await openTab(context, sw, FIXTURE_URL_2);
            console.log(`[exception] tabId=${tabId}`);
            expect(tabId, 'should have found a valid tab ID').toBeGreaterThan(0);

            const muted = await getTabMuted(sw, tabId);
            console.log(`[exception] mutedInfo.muted=${muted}`);
            expect(muted, 'excepted domain should NOT be muted').toBe(false);

            await newPage.close();
        } finally {
            await cov?.close();
            await context?.close();
        }
    });

    test('tab is not muted when tabsMuteAll=false', async () => {
        let cov: ServiceWorkerCoverage | undefined;
        let context: BrowserContext | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            const basePage = await context.newPage();
            await basePage.goto(FIXTURE_URL, { waitUntil: 'load' });
            await basePage.waitForTimeout(500);

            // Explicitly disabled (matches default)
            await setMuteConf(sw, false, []);

            const { page: newPage, tabId } = await openTab(context, sw, FIXTURE_URL_2);
            console.log(`[disabled] tabId=${tabId}`);
            expect(tabId, 'should have found a valid tab ID').toBeGreaterThan(0);

            const muted = await getTabMuted(sw, tabId);
            console.log(`[disabled] mutedInfo.muted=${muted}`);
            expect(muted, 'tab should not be muted when feature is off').toBe(false);

            await newPage.close();
        } finally {
            await cov?.close();
            await context?.close();
        }
    });
});
