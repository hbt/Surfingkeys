/**
 * Diagnostic: what state (frozen, discarded, status) do background tabs spawn in
 * when opened via cmd_nav_open_clipboard (cc)?
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-tab-spawn-state.spec.ts \
 *     --config=playwright.scratch.config.ts
 */
import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
let context: BrowserContext;
let page: Page;

async function getAllTabsViaSW(): Promise<any[]> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => new Promise<any[]>(resolve =>
        chrome.tabs.query({ currentWindow: true }, resolve)
    ));
}

async function closeExtraTabs(keepId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate((id: number) => new Promise<void>(resolve => {
        chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
            const toClose = tabs.filter((t: any) => t.id !== id).map((t: any) => t.id);
            if (!toClose.length) { resolve(); return; }
            chrome.tabs.remove(toClose, () => resolve());
        });
    }), keepId);
}

test.describe('scratch: tab spawn state (frozen/discarded)', () => {
    let fixtureTabId: number;

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        const sw = context.serviceWorkers()[0];
        fixtureTabId = await sw.evaluate(() => new Promise<number>(resolve =>
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) =>
                resolve(tabs[0]?.id ?? -1)
            )
        ));

        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'cc', 'cmd_nav_open_clipboard');
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.afterEach(async () => {
        await closeExtraTabs(fixtureTabId);
        await page.waitForTimeout(200);
    });

    test('tab state immediately after opening via cc (multiple URLs)', async () => {
        const urls = [
            `${FIXTURE_BASE}/scroll-test.html`,
            `${FIXTURE_BASE}/form-test.html`,
            `${FIXTURE_BASE}/scroll-test.html`,
        ].join('\n');

        await page.evaluate((text: string) => navigator.clipboard.writeText(text), urls);
        await page.waitForTimeout(100);
        await page.evaluate(() => window.getSelection()?.removeAllRanges());

        const before = await getAllTabsViaSW();
        const beforeIds = new Set(before.map((t: any) => t.id));

        // Trigger cc
        await page.keyboard.press('c');
        await page.waitForTimeout(50);
        await page.keyboard.press('c');

        // Poll until 3 new tabs appear
        let newTabs: any[] = [];
        for (let i = 0; i < 40; i++) {
            await page.waitForTimeout(150);
            const all = await getAllTabsViaSW();
            newTabs = all.filter((t: any) => !beforeIds.has(t.id));
            if (newTabs.length >= 3) break;
        }

        console.log(`\n=== ${newTabs.length} new tab(s) spawned ===`);
        for (const t of newTabs) {
            console.log(JSON.stringify({
                id: t.id,
                url: t.url,
                active: t.active,
                status: t.status,
                frozen: t.frozen,
                discarded: t.discarded,
                autoDiscardable: t.autoDiscardable,
            }, null, 2));
        }

        expect(newTabs.length).toBe(3);

        // Summarise spawn state
        const frozenCount    = newTabs.filter((t: any) => t.frozen).length;
        const discardedCount = newTabs.filter((t: any) => t.discarded).length;
        const loadingCount   = newTabs.filter((t: any) => t.status === 'loading').length;
        const completeCount  = newTabs.filter((t: any) => t.status === 'complete').length;

        console.log(`\nSummary:`);
        console.log(`  frozen:    ${frozenCount}/${newTabs.length}`);
        console.log(`  discarded: ${discardedCount}/${newTabs.length}`);
        console.log(`  loading:   ${loadingCount}/${newTabs.length}`);
        console.log(`  complete:  ${completeCount}/${newTabs.length}`);
    });

    test('tab state after waiting 2s (do they get frozen?)', async () => {
        const urls = [
            `${FIXTURE_BASE}/scroll-test.html`,
            `${FIXTURE_BASE}/form-test.html`,
        ].join('\n');

        await page.evaluate((text: string) => navigator.clipboard.writeText(text), urls);
        await page.waitForTimeout(100);
        await page.evaluate(() => window.getSelection()?.removeAllRanges());

        const before = await getAllTabsViaSW();
        const beforeIds = new Set(before.map((t: any) => t.id));

        await page.keyboard.press('c');
        await page.waitForTimeout(50);
        await page.keyboard.press('c');

        // Wait for tabs to appear
        let newTabs: any[] = [];
        for (let i = 0; i < 40; i++) {
            await page.waitForTimeout(150);
            const all = await getAllTabsViaSW();
            newTabs = all.filter((t: any) => !beforeIds.has(t.id));
            if (newTabs.length >= 2) break;
        }
        expect(newTabs.length).toBe(2);

        console.log('\n=== immediately after spawn ===');
        for (const t of newTabs) {
            console.log(`  tab ${t.id}: status=${t.status} frozen=${t.frozen} discarded=${t.discarded}`);
        }

        // Wait 2 seconds and re-query
        await page.waitForTimeout(2000);
        const all2 = await getAllTabsViaSW();
        const later = all2.filter((t: any) => newTabs.some((n: any) => n.id === t.id));

        console.log('\n=== after 2s ===');
        for (const t of later) {
            console.log(`  tab ${t.id}: status=${t.status} frozen=${t.frozen} discarded=${t.discarded}`);
        }

        expect(later.length).toBe(2);
    });
});
