/**
 * Scratch test: open 3 links via cmd_hints_link_background_tab
 *
 * Compares newTabPosition 'left' vs 'right' using actual Chrome tab indices.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/open-3-links-background-tab.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/hints-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function fetchHintSnapshot(p: Page) {
    return p.evaluate(new Function(`return (${HINT_SNAPSHOT_FN})()`) as () => any);
}

async function waitForHintCount(p: Page, minCount: number, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`waitForHintCount: timed out waiting for ${minCount} hints`);
}

async function waitForPageCount(expected: number, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (context.pages().length === expected) return;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`waitForPageCount: timed out, got ${context.pages().length}, expected ${expected}`);
}

async function callSKApi(p: Page, fn: string, ...args: unknown[]) {
    await p.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', { detail: [f, ...a], bubbles: true, composed: true }));
    }, [fn, args] as [string, unknown[]]);
    await p.waitForTimeout(100);
}

async function setBgConf(key: string, value: unknown) {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(([k, v]: [string, unknown]) => {
        (globalThis as any).__CDP_MESSAGE_BRIDGE__.dispatch('updateSettings', {
            scope: 'snippets',
            settings: { [k]: v },
        });
    }, [key, value] as [string, unknown]);
    await new Promise(r => setTimeout(r, 50));
}

async function getTabsViaSW(): Promise<any[]> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => new Promise<any[]>(resolve =>
        chrome.tabs.query({ currentWindow: true }, tabs => resolve(tabs))
    ));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.describe('open 3 links via cmd_hints_link_background_tab', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        for (const p of context.pages()) {
            if (p !== page) await p.close().catch(() => {});
        }
        await page.bringToFront();
        await page.waitForTimeout(200);
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'C', 'cmd_hints_link_background_tab');
    });

    // -----------------------------------------------------------------------

    async function openThreeLinks(position: string) {
        await setBgConf('newTabPosition', position);

        const initialCount = context.pages().length;
        const openOrder: { hint: string; url: string; chromeIndex: number }[] = [];

        for (let i = 0; i < 3; i++) {
            const pagesBefore = new Set(context.pages());

            await page.mouse.click(100, 100);
            await page.keyboard.press('Shift+C');
            await waitForHintCount(page, 10);

            const snap = await fetchHintSnapshot(page);
            const hint: string = snap.sortedHints[i];
            expect(hint).toBeTruthy();

            for (const char of hint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }

            await waitForPageCount(initialCount + i + 1);

            const newTab = context.pages().find(p => !pagesBefore.has(p))!;
            await newTab.waitForLoadState('domcontentloaded').catch(() => {});

            const chromeTabs = await getTabsViaSW();
            const chromeTab = chromeTabs.find((t: any) => t.url === newTab.url());
            openOrder.push({ hint, url: newTab.url(), chromeIndex: chromeTab?.index ?? -1 });
        }

        const chromeTabs = await getTabsViaSW();
        const sorted = [...chromeTabs].sort((a, b) => a.index - b.index);

        console.log(`\n=== newTabPosition='${position}' ===`);
        console.log('Open order:');
        openOrder.forEach((e, i) => console.log(`  ${i + 1}. hint=${e.hint} chromeIndex=${e.chromeIndex} → ${e.url}`));
        console.log('All tabs (by Chrome index):');
        sorted.forEach(t => console.log(`  [${t.index}] ${t.url}`));

        return { openOrder, sorted };
    }

    test('newTabPosition=right', async () => {
        const { sorted } = await openThreeLinks('right');
        // fixture tab is index 0; each new tab should be at index 1, pushing others right
        expect(sorted[0].url).toContain('hints-test.html');
        // The 3 opened tabs should be at indices 1, 2, 3 (fixture stays at 0)
        expect(sorted).toHaveLength(4);
        const fixtureIdx = sorted.findIndex((t: any) => t.url.includes('hints-test.html'));
        expect(fixtureIdx).toBe(0);
    });

    test('newTabPosition=left', async () => {
        const { sorted } = await openThreeLinks('left');
        // Each new tab inserted at fixture's current index, pushing fixture right
        // After 3 opens: fixture ends up at index 3
        expect(sorted).toHaveLength(4);
        const fixtureIdx = sorted.findIndex((t: any) => t.url.includes('hints-test.html'));
        expect(fixtureIdx).toBe(3);
    });
});
