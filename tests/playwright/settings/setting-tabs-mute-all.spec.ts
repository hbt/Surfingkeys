/**
 * Settings test: tabsMuteAll + tabsMuteExceptions
 *
 * Verifies:
 *   1. Config pipeline: injecting tabsMuteAll=true via __CDP_MESSAGE_BRIDGE__
 *      reaches SW conf and is persisted to chrome.storage.local.
 *   2. Mute-all: with tabsMuteAll=true and no exceptions, a newly navigated tab
 *      has mutedInfo.muted === true immediately after load.
 *   3. Exception match: with tabsMuteAll=true and tabsMuteExceptions=['127.0.0.1'],
 *      navigating to the fixture server (127.0.0.1) results in muted === false.
 *   4. Disabled: with tabsMuteAll=false, a newly navigated tab is not muted.
 *
 * Mechanism:
 *   - Uses __CDP_MESSAGE_BRIDGE__ to call updateSettings({scope:'snippets'}) in the
 *     SW, which writes into the in-memory `conf` object (same path as the user's
 *     config file) and persists to chrome.storage.local.
 *   - Navigates a new tab to a fixture HTTP URL.
 *   - Reads mutedInfo.muted via chrome.tabs.get() from the SW after page load.
 *   - Each test gets its own isolated browser context to prevent state leakage.
 *
 * Run:
 *   bunx playwright test tests/playwright/settings/setting-tabs-mute-all.spec.ts
 */

import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL   = `${FIXTURE_BASE}/scroll-test.html`;
const FIXTURE_URL_2 = `${FIXTURE_BASE}/hints-test.html`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function setMuteConf(sw: any, tabsMuteAll: boolean, tabsMuteExceptions: string[]): Promise<void> {
    await sw.evaluate(({ all, exc }: { all: boolean; exc: string[] }) => {
        (globalThis as any).__CDP_MESSAGE_BRIDGE__.dispatch('updateSettings', {
            scope: 'snippets',
            settings: { tabsMuteAll: all, tabsMuteExceptions: exc },
        });
    }, { all: tabsMuteAll, exc: tabsMuteExceptions });
    // Brief settle so conf is updated before any navigation.
    await new Promise(r => setTimeout(r, 150));
}

async function getStoredMuteAll(sw: any): Promise<boolean | undefined> {
    return sw.evaluate(() =>
        new Promise<boolean | undefined>(resolve =>
            chrome.storage.local.get('tabsMuteAll', (r: any) => resolve(r.tabsMuteAll))
        )
    );
}

async function getStoredMuteExceptions(sw: any): Promise<string[] | undefined> {
    return sw.evaluate(() =>
        new Promise<string[] | undefined>(resolve =>
            chrome.storage.local.get('tabsMuteExceptions', (r: any) => resolve(r.tabsMuteExceptions))
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
    // Snapshot existing IDs before opening so we can identify the new tab.
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

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe('setting: tabsMuteAll', () => {
    test.setTimeout(30_000);

    // Each test gets its own fresh browser context to avoid state leakage.

    // ─── Config pipeline ─────────────────────────────────────────────────────

    test('config pipeline: tabsMuteAll=true persists to chrome.storage.local', async () => {
        let cov: ServiceWorkerCoverage | undefined;
        let context: BrowserContext | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            const page = await context.newPage();
            await page.goto(FIXTURE_URL, { waitUntil: 'load' });
            await page.waitForTimeout(300);

            // Inject via the same path as user config file snippets
            await setMuteConf(sw, true, ['example.com']);

            const storedAll = await getStoredMuteAll(sw);
            expect(storedAll, 'tabsMuteAll must be persisted to chrome.storage.local').toBe(true);

            const storedExc = await getStoredMuteExceptions(sw);
            expect(storedExc, 'tabsMuteExceptions must be persisted to chrome.storage.local').toEqual(['example.com']);

            // Flip to false and verify storage is updated
            await setMuteConf(sw, false, []);
            const storedAll2 = await getStoredMuteAll(sw);
            expect(storedAll2, 'storage must reflect updated tabsMuteAll=false').toBe(false);
        } finally {
            await cov?.close();
            await context?.close();
        }
    });

    // ─── Behaviour: mute-all ─────────────────────────────────────────────────

    test('mute-all: tab is muted when tabsMuteAll=true and no exceptions', async () => {
        let cov: ServiceWorkerCoverage | undefined;
        let context: BrowserContext | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            // Seed a base page so the extension is active before enabling mute.
            const basePage = await context.newPage();
            await basePage.goto(FIXTURE_URL, { waitUntil: 'load' });
            await basePage.waitForTimeout(500);

            await setMuteConf(sw, true, []);
            expect(await getStoredMuteAll(sw), 'conf.tabsMuteAll must be true before navigation').toBe(true);

            const { page: newPage, tabId } = await openTab(context, sw, FIXTURE_URL_2);
            expect(tabId, 'should have found a valid tab ID').toBeGreaterThan(0);

            const muted = await getTabMuted(sw, tabId);
            expect(muted, 'tab should be auto-muted on load when tabsMuteAll=true').toBe(true);

            await newPage.close();
        } finally {
            await cov?.close();
            await context?.close();
        }
    });

    // ─── Behaviour: exception match ───────────────────────────────────────────

    test('exception match: excepted hostname is not muted', async () => {
        let cov: ServiceWorkerCoverage | undefined;
        let context: BrowserContext | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            const basePage = await context.newPage();
            await basePage.goto(FIXTURE_URL, { waitUntil: 'load' });
            await basePage.waitForTimeout(500);

            // Enable auto-mute but except the fixture server hostname (127.0.0.1).
            await setMuteConf(sw, true, ['127.0.0.1']);
            expect(await getStoredMuteAll(sw), 'conf.tabsMuteAll must be true before navigation').toBe(true);

            const { page: newPage, tabId } = await openTab(context, sw, FIXTURE_URL_2);
            expect(tabId, 'should have found a valid tab ID').toBeGreaterThan(0);

            const muted = await getTabMuted(sw, tabId);
            expect(muted, 'excepted domain (127.0.0.1) should NOT be muted').toBe(false);

            await newPage.close();
        } finally {
            await cov?.close();
            await context?.close();
        }
    });

    // ─── Behaviour: disabled ─────────────────────────────────────────────────

    test('disabled: tab is not muted when tabsMuteAll=false', async () => {
        let cov: ServiceWorkerCoverage | undefined;
        let context: BrowserContext | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            const basePage = await context.newPage();
            await basePage.goto(FIXTURE_URL, { waitUntil: 'load' });
            await basePage.waitForTimeout(500);

            // Explicitly disabled (matches the default).
            await setMuteConf(sw, false, []);

            const { page: newPage, tabId } = await openTab(context, sw, FIXTURE_URL_2);
            expect(tabId, 'should have found a valid tab ID').toBeGreaterThan(0);

            const muted = await getTabMuted(sw, tabId);
            expect(muted, 'tab should not be muted when tabsMuteAll=false').toBe(false);

            await newPage.close();
        } finally {
            await cov?.close();
            await context?.close();
        }
    });
});
