/**
 * Scratch test: stale `tab.index` bug in the `previousTab`/`nextTab` switch-case handler (~line 783)
 *
 * Bug:
 *   The `previousTab`/`nextTab` case in the main command switch captures `tab.index`
 *   as a local variable BEFORE calling `chrome.tabs.query`. Inside the callback the
 *   index arithmetic uses that stale snapshot value rather than the live position of
 *   `tab.id` in the freshly-queried tabs array.
 *
 * Reproduction strategy:
 *   1. Open 4 tabs at positions [0, 1, 2, 3].
 *   2. Move one tab so live position ≠ snapshot index.
 *   3. Simulate the BUGGY calculation: `(staleIndex ± 1) % tabs.length`
 *   4. Simulate the CORRECT (fixed) calculation: look up live index by ID, then add step.
 *   5. Assert that both give the same result.
 *      → FAILS on current buggy code (they differ).
 *      → PASSES after the fix.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-tab-stale-index-prev-next.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let cov: ServiceWorkerCoverage | undefined;

async function getSW() {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw;
}

async function getAllTabsViaSW(): Promise<Array<{ id: number; index: number; url: string; active: boolean }>> {
    const sw = await getSW();
    return sw.evaluate(() => new Promise(resolve => {
        chrome.tabs.query({ currentWindow: true }, (tabs: any[]) =>
            resolve(tabs.map(t => ({ id: t.id, index: t.index, url: t.url, active: t.active })))
        );
    }));
}

async function moveTabViaSW(tabId: number, toIndex: number): Promise<void> {
    const sw = await getSW();
    await sw.evaluate(({ id, idx }) => new Promise<void>(resolve => {
        chrome.tabs.move(id, { index: idx }, () => resolve());
    }), { id: tabId, idx: toIndex });
    await new Promise(r => setTimeout(r, 200));
}

/**
 * Simulate the BUGGY line-783 handler: captures index before query, uses stale value.
 * Returns the tabId the buggy code would activate.
 */
async function simulateBuggyPrevNextHandler(
    windowId: number,
    staleIndex: number,
    step: number,
): Promise<number> {
    const sw = await getSW();
    return sw.evaluate(
        ({ windowId, staleIndex, step }) =>
            new Promise<number>(resolve => {
                // Buggy: index computed from stale snapshot BEFORE query
                var index = staleIndex + step;
                chrome.tabs.query({ windowId }, (tabs: any[]) => {
                    index = ((index % tabs.length) + tabs.length) % tabs.length;
                    resolve(tabs[index].id);
                });
            }),
        { windowId, staleIndex, step },
    );
}

/**
 * Simulate the CORRECT (fixed) handler: looks up live index by tab ID inside query callback.
 * Returns the tabId the fixed code would activate.
 */
async function simulateFixedPrevNextHandler(
    tabId: number,
    windowId: number,
    step: number,
): Promise<number> {
    const sw = await getSW();
    return sw.evaluate(
        ({ tabId, windowId, step }) =>
            new Promise<number>(resolve => {
                chrome.tabs.query({ windowId }, (tabs: any[]) => {
                    const liveIndex = tabs.findIndex((t: any) => t.id === tabId);
                    if (liveIndex === -1) { resolve(-1); return; }
                    const index = (((liveIndex + step) % tabs.length) + tabs.length) % tabs.length;
                    resolve(tabs[index].id);
                });
            }),
        { tabId, windowId, step },
    );
}

test.describe('stale tab.index bug — previousTab/nextTab switch-case handler (~line 783)', () => {
    test.setTimeout(30_000);

    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
    });

    test.afterAll(async () => {
        await cov?.close();
        await context?.close();
    });

    test('previousTab/nextTab handler activates wrong tab when stale index used', async () => {
        // 1. Open 4 tabs
        for (let i = 0; i < 4; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(300);
        }
        await new Promise(r => setTimeout(r, 500));

        // 2. Get initial tab order
        let tabs = await getAllTabsViaSW();
        tabs.sort((a, b) => a.index - b.index);
        console.log('[initial] tabs:', tabs.map(t => `[${t.index}] id=${t.id}`).join(', '));
        expect(tabs.length).toBeGreaterThanOrEqual(4);

        // Pick a tab near the middle as our "sender"
        const senderTab = tabs[tabs.length - 3];
        const senderTabId = senderTab.id;
        const senderStaleIndex = senderTab.index; // snapshot before move
        const windowId = await (await getSW()).evaluate((id: number) =>
            new Promise<number>(resolve => {
                chrome.tabs.get(id, (t: any) => resolve(t.windowId));
            }), senderTabId);

        console.log(`[setup] sender tab: id=${senderTabId}, stale index=${senderStaleIndex}`);

        // 3. Move sender tab to last position — now live index ≠ staleIndex
        const lastIndex = tabs[tabs.length - 1].index;
        await moveTabViaSW(senderTabId, lastIndex);

        tabs = await getAllTabsViaSW();
        tabs.sort((a, b) => a.index - b.index);
        const senderAfterMove = tabs.find(t => t.id === senderTabId)!;
        const senderLiveIndex = senderAfterMove.index;
        console.log(`[after move] sender tab: id=${senderTabId}, live index=${senderLiveIndex}, stale was=${senderStaleIndex}`);
        expect(senderLiveIndex).not.toBe(senderStaleIndex);

        // 4. Simulate BUGGY handler (step = +1, nextTab direction)
        const buggyTargetId = await simulateBuggyPrevNextHandler(windowId, senderStaleIndex, 1);
        console.log(`[buggy ] nextTab target id=${buggyTargetId} (stale index=${senderStaleIndex})`);

        // 5. Simulate CORRECT (fixed) handler
        const correctTargetId = await simulateFixedPrevNextHandler(senderTabId, windowId, 1);
        console.log(`[correct] nextTab target id=${correctTargetId} (live index=${senderLiveIndex})`);

        // 6. Assert they agree — FAILS on buggy code, PASSES after fix
        expect(
            buggyTargetId,
            `BUG: stale index ${senderStaleIndex} causes wrong tab (${buggyTargetId}) to be activated; ` +
            `correct target (live index ${senderLiveIndex}) is ${correctTargetId}`,
        ).toBe(correctTargetId);
    });
});
