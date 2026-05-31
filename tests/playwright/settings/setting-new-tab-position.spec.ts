/**
 * Settings test: newTabPosition
 *
 * Verifies two things:
 *   1. Config pipeline: injecting newTabPosition via __CDP_MESSAGE_BRIDGE__ (the same
 *      path as user config snippets) reaches SW conf and is persisted to
 *      chrome.storage.local.
 *   2. Behavior: new tabs opened via cmd_hints_link_background_tab land at the
 *      index dictated by newTabPosition ('left' vs 'right').
 *
 * Note: newTabPosition is in CONF_DEFAULTS and therefore also in runtime.conf.
 * Because front.ts filters keys that exist in runtime.conf before forwarding to
 * the SW, user-config assignments to newTabPosition are currently blocked at the
 * content-script boundary. The pipeline test documents the expected SW behavior
 * regardless of that gap; the behavior tests use __CDP_MESSAGE_BRIDGE__ to inject
 * the setting directly into the SW (bypassing the content-script filter).
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/hints-test.html`;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

async function setNewTabPosition(sw: any, position: string): Promise<void> {
    await sw.evaluate((pos: string) => {
        (globalThis as any).__CDP_MESSAGE_BRIDGE__.dispatch('updateSettings', {
            scope: 'snippets',
            settings: { newTabPosition: pos },
        });
    }, position);
    await new Promise(r => setTimeout(r, 150));
}

async function getStoredNewTabPosition(sw: any): Promise<string | undefined> {
    return sw.evaluate(() =>
        new Promise<string | undefined>(resolve =>
            chrome.storage.local.get('newTabPosition', (r: any) => resolve(r.newTabPosition))
        )
    );
}

async function getTabsSorted(sw: any): Promise<any[]> {
    return sw.evaluate(() =>
        new Promise<any[]>(resolve =>
            chrome.tabs.query({ currentWindow: true }, tabs =>
                resolve([...tabs].sort((a, b) => a.index - b.index))
            )
        )
    );
}

const HINT_SNAPSHOT_FN = `() => {
    const hintsHost = document.querySelector('.surfingkeys_hints_host');
    if (!hintsHost || !hintsHost.shadowRoot) {
        return { found: false, count: 0, sortedHints: [] };
    }
    const hintDivs = Array.from(hintsHost.shadowRoot.querySelectorAll('div')).filter(d => {
        const text = (d.textContent || '').trim();
        return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
    });
    return { found: true, count: hintDivs.length, sortedHints: hintDivs.map(h => h.textContent?.trim()).sort() };
}`;

async function waitForHintCount(page: Page, minCount: number, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await page.evaluate(new Function(`return (${HINT_SNAPSHOT_FN})()`) as () => any);
        if (snap.found && snap.count >= minCount) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`waitForHintCount: timed out waiting for ${minCount} hints`);
}

async function waitForPageCount(context: BrowserContext, expected: number, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (context.pages().length === expected) return;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`waitForPageCount: timed out, got ${context.pages().length}, expected ${expected}`);
}

/** Open `count` links via hint-mode and return the Chrome tab list sorted by index. */
async function openLinksViaHints(
    context: BrowserContext,
    page: Page,
    count: number,
): Promise<any[]> {
    const initialCount = context.pages().length;

    for (let i = 0; i < count; i++) {
        const pagesBefore = new Set(context.pages());
        await page.mouse.click(100, 100);
        await page.keyboard.press('Shift+C');
        await waitForHintCount(page, 10);

        const snap = await page.evaluate(new Function(`return (${HINT_SNAPSHOT_FN})()`) as () => any);
        const hint: string = snap.sortedHints[i];
        expect(hint).toBeTruthy();

        for (const char of hint) {
            await page.keyboard.press(char);
            await page.waitForTimeout(50);
        }

        await waitForPageCount(context, initialCount + i + 1);
        const newTab = context.pages().find(p => !pagesBefore.has(p))!;
        await newTab.waitForLoadState('domcontentloaded').catch(() => {});
    }

    return getTabsSorted(context.serviceWorkers()[0]);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe('setting: newTabPosition', () => {
    test.setTimeout(60_000);

    // Each test gets its own isolated browser context to prevent setting leakage.

    // -------------------------------------------------------------------------
    // 1. Config pipeline — SW storage persistence
    // -------------------------------------------------------------------------

    test('updateSettings reaches SW conf and is persisted to chrome.storage.local', async () => {
        let context: BrowserContext | undefined;
        let cov: ServiceWorkerCoverage | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            const basePage = await context.newPage();
            await basePage.goto(FIXTURE_URL, { waitUntil: 'load' });
            await basePage.waitForTimeout(500);

            // Default should not be in storage yet (only written when explicitly set)
            const before = await getStoredNewTabPosition(sw);
            // Inject 'left' via the snippets path (same as user config pipeline)
            await setNewTabPosition(sw, 'left');

            const stored = await getStoredNewTabPosition(sw);
            expect(stored, 'newTabPosition must be persisted to chrome.storage.local after updateSettings').toBe('left');

            // Change to 'first' and verify storage is updated
            await setNewTabPosition(sw, 'first');
            const stored2 = await getStoredNewTabPosition(sw);
            expect(stored2, 'newTabPosition storage must reflect the latest value').toBe('first');
        } finally {
            await cov?.close();
            await context?.close();
        }
    });

    // -------------------------------------------------------------------------
    // 2. Behavior — newTabPosition='right'
    // -------------------------------------------------------------------------

    test("newTabPosition='right': new tabs open immediately after the current tab", async () => {
        let context: BrowserContext | undefined;
        let cov: ServiceWorkerCoverage | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            const page = await context.newPage();
            await page.goto(FIXTURE_URL, { waitUntil: 'load' });
            await page.waitForTimeout(500);

            await setNewTabPosition(sw, 'right');

            await callSKApi(page, 'unmapAllExcept', []);
            await callSKApi(page, 'mapcmdkey', 'C', 'cmd_hints_link_background_tab');

            const sorted = await openLinksViaHints(context, page, 3);

            // Filter out any about:blank tabs opened by Playwright itself
            const meaningful = sorted.filter((t: any) => t.url !== 'about:blank');
            // Fixture tab + 3 new tabs
            expect(meaningful).toHaveLength(4);
            // With newTabPosition='right', each new tab opens immediately after the
            // fixture tab, so the fixture tab stays at the lowest index among the 4.
            const fixtureIdx = meaningful.findIndex((t: any) => t.url.includes('hints-test.html'));
            expect(fixtureIdx, 'fixture tab should be at the lowest index with newTabPosition=right').toBe(0);
        } finally {
            await cov?.close();
            await context?.close();
        }
    });

    // -------------------------------------------------------------------------
    // 3. Behavior — newTabPosition='left'
    // -------------------------------------------------------------------------

    test("newTabPosition='left': new tabs open before the current tab, pushing it right", async () => {
        let context: BrowserContext | undefined;
        let cov: ServiceWorkerCoverage | undefined;
        try {
            ({ context, cov } = await launchWithCoverage());
            const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

            const page = await context.newPage();
            await page.goto(FIXTURE_URL, { waitUntil: 'load' });
            await page.waitForTimeout(500);

            await setNewTabPosition(sw, 'left');

            await callSKApi(page, 'unmapAllExcept', []);
            await callSKApi(page, 'mapcmdkey', 'C', 'cmd_hints_link_background_tab');

            const sorted = await openLinksViaHints(context, page, 3);

            // Filter out any about:blank tabs opened by Playwright itself
            const meaningful = sorted.filter((t: any) => t.url !== 'about:blank');
            // Fixture tab + 3 new tabs
            expect(meaningful).toHaveLength(4);
            // With newTabPosition='left', each new tab is inserted at the fixture's current
            // index, pushing the fixture tab right each time. After 3 opens, fixture is last.
            const fixtureIdx = meaningful.findIndex((t: any) => t.url.includes('hints-test.html'));
            expect(fixtureIdx, 'fixture tab should be pushed to last position with newTabPosition=left').toBe(3);
        } finally {
            await cov?.close();
            await context?.close();
        }
    });
});
