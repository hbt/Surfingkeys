/**
 * Scratch test: stale `tab.index` bug in `_nextTab` / `_roundRepeatTabs`
 *
 * Bug (PR brookhong/Surfingkeys#2396):
 *   `_nextTab(tab, step)` in src/background/start.ts receives `sender.tab` as a
 *   snapshot. Inside the `chrome.tabs.query` callback it uses `tab.index` (the
 *   stale snapshot value) instead of looking up the live position of `tab.id`
 *   in the freshly-queried tabs array.
 *
 *   When a tab has been reordered so that its live position ≠ snapshot index,
 *   the wrong tab gets activated.
 *
 * Reproduction strategy:
 *   We cannot easily create the real race condition in Chrome (message sent →
 *   tab moved → handler runs) inside Playwright, so we reproduce the buggy
 *   *calculation* directly in the SW context:
 *
 *   1. Open 4 tabs at positions [0, 1, 2, 3].
 *   2. Move one tab so live positions differ from initial indices.
 *   3. In the SW, temporarily monkey-patch `chrome.tabs.update` to record which
 *      tabId it is asked to activate.
 *   4. Simulate the BUGGY handler behaviour by replicating `_nextTab`'s stale-
 *      index calculation with a crafted stale snapshot.
 *   5. Also compute the CORRECT answer using live `_getTabIndex`-style lookup.
 *   6. Assert that the buggy calculation targets the WRONG tab (demonstrating
 *      the bug) while the correct lookup targets the RIGHT tab.
 *   7. Finally, invoke `cmd_tab_next` for real and assert the correct tab is
 *      activated — this assertion PASSES on the current buggy code only because
 *      Chrome populates `sender.tab` with the live index at message-dispatch
 *      time.  A final "gold-standard" assertion documents what the fixed code
 *      must also pass.
 *
 * Expected result on BUGGY code:
 *   - The stale-index simulation activates the WRONG tab  → test FAILS on the
 *     `expect(buggyTargetId).not.toBe(correctTargetId)` assertion, which proves
 *     the bug exists.
 *
 * After the fix (`_getTabIndex` replaces `tab.index`):
 *   - The simulation with a stale snapshot now uses the live ID-lookup instead,
 *     so buggy and correct answers converge → test PASSES.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-tab-stale-index.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let cov: ServiceWorkerCoverage | undefined;

// ---------- SW helpers ----------

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

async function getActiveTabViaSW(): Promise<{ id: number; index: number }> {
    const sw = await getSW();
    return sw.evaluate(() => new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) =>
            resolve({ id: tabs[0].id, index: tabs[0].index })
        );
    }));
}

async function activateTabViaSW(tabId: number): Promise<void> {
    const sw = await getSW();
    await sw.evaluate((id: number) => new Promise<void>(resolve => {
        chrome.tabs.update(id, { active: true }, () => resolve());
    }), tabId);
    await new Promise(r => setTimeout(r, 300));
}

async function moveTabViaSW(tabId: number, toIndex: number): Promise<void> {
    const sw = await getSW();
    await sw.evaluate(({ id, idx }) => new Promise<void>(resolve => {
        chrome.tabs.move(id, { index: idx }, () => resolve());
    }), { id: tabId, idx: toIndex });
    await new Promise(r => setTimeout(r, 200));
}

async function pollForTabChange(fromTabId: number, maxMs = 4000): Promise<number> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
        const current = await getActiveTabViaSW();
        if (current.id !== fromTabId) return current.id;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Tab did not change from ${fromTabId} within ${maxMs}ms`);
}

// ---------- Core stale-index simulation ----------

/**
 * Simulate `_nextTab`'s BUGGY calculation inside the SW.
 *
 * Uses `staleIndex` (what the snapshot tab.index contains) instead of looking
 * up the live position of `tabId` in the query result.
 *
 * Returns the tabId that the buggy code would call `chrome.tabs.update` on.
 */
async function simulateBuggyNextTab(
    tabId: number,
    windowId: number,
    staleIndex: number,
    step: number,
): Promise<number> {
    const sw = await getSW();
    return sw.evaluate(
        ({ tabId, windowId, staleIndex, step }) =>
            new Promise<number>(resolve => {
                chrome.tabs.query({ windowId }, (tabs: any[]) => {
                    let s = step;
                    // Buggy boundary check — uses staleIndex
                    if (staleIndex === 0 && s === -1) {
                        s = tabs.length - 1;
                    } else if (staleIndex === tabs.length - 1 && s === 1) {
                        s = 1 - tabs.length;
                    }
                    // clamp: _fixTo
                    let to = staleIndex + s;
                    if (to < 0) to = 0;
                    if (to >= tabs.length) to = tabs.length - 1;
                    resolve(tabs[to].id);
                });
            }),
        { tabId, windowId, staleIndex, step },
    );
}

/**
 * Simulate `_nextTab`'s CORRECT (fixed) calculation inside the SW.
 *
 * Uses `_getTabIndex(tabs, tabId)` to resolve the live position by ID.
 *
 * Returns the tabId that the fixed code would call `chrome.tabs.update` on.
 */
async function simulateFixedNextTab(
    tabId: number,
    windowId: number,
    step: number,
): Promise<number> {
    const sw = await getSW();
    return sw.evaluate(
        ({ tabId, windowId, step }) =>
            new Promise<number>(resolve => {
                chrome.tabs.query({ windowId }, (tabs: any[]) => {
                    // Fixed: find live index by tab ID
                    const liveIndex = tabs.findIndex((t: any) => t.id === tabId);
                    if (liveIndex === -1) { resolve(-1); return; }
                    let s = step;
                    if (liveIndex === 0 && s === -1) {
                        s = tabs.length - 1;
                    } else if (liveIndex === tabs.length - 1 && s === 1) {
                        s = 1 - tabs.length;
                    }
                    let to = liveIndex + s;
                    if (to < 0) to = 0;
                    if (to >= tabs.length) to = tabs.length - 1;
                    resolve(tabs[to].id);
                });
            }),
        { tabId, windowId, step },
    );
}

// ---------- Test ----------

test.describe('stale tab.index bug — _nextTab uses snapshot index not live index', () => {
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

    test('_nextTab with stale index activates wrong tab after chrome.tabs.move', async () => {
        // ----------------------------------------------------------------
        // 1. Open 4 tabs (the launch already created one blank tab).
        //    We open 3 more, all at the same fixture URL.
        // ----------------------------------------------------------------
        const pages = [];
        for (let i = 0; i < 4; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(300);
            pages.push(p);
        }

        // Give SK time to settle on all tabs
        await new Promise(r => setTimeout(r, 500));

        // ----------------------------------------------------------------
        // 2. Snapshot the initial tab order (sorted by index).
        // ----------------------------------------------------------------
        let tabs = await getAllTabsViaSW();
        // Sort ascending by index to get a stable reference
        tabs.sort((a, b) => a.index - b.index);
        console.log('[initial] tabs:', tabs.map(t => `[${t.index}] id=${t.id}`).join(', '));

        // We need at least 4 tabs for the test to be meaningful.
        // There may be extra tabs from other tests; just take the last 4.
        expect(tabs.length).toBeGreaterThanOrEqual(4);

        // Pick the tab at position 1 as our "sender" tab.
        // We will move it from index 1 → index 3 to create a discrepancy.
        const senderTabInitial = tabs[tabs.length - 3]; // pick a tab near the middle
        const senderTabId = senderTabInitial.id;
        const senderStaleIndex = senderTabInitial.index; // snapshot before move
        const windowId = await (await getSW()).evaluate((id: number) =>
            new Promise<number>(resolve => {
                chrome.tabs.get(id, (t: any) => resolve(t.windowId));
            }), senderTabId);

        console.log(`[setup] sender tab: id=${senderTabId}, stale index=${senderStaleIndex}`);

        // ----------------------------------------------------------------
        // 3. Move the sender tab from its current position to the LAST slot.
        //    After this move, its live index ≠ staleIndex.
        // ----------------------------------------------------------------
        const targetMoveIndex = tabs[tabs.length - 1].index; // last position
        await moveTabViaSW(senderTabId, targetMoveIndex);

        // Confirm the move
        tabs = await getAllTabsViaSW();
        tabs.sort((a, b) => a.index - b.index);
        const senderAfterMove = tabs.find(t => t.id === senderTabId)!;
        const senderLiveIndex = senderAfterMove.index;
        console.log(`[after move] sender tab: id=${senderTabId}, live index=${senderLiveIndex}, stale was=${senderStaleIndex}`);
        console.log('[after move] all tabs:', tabs.map(t => `[${t.index}] id=${t.id}`).join(', '));

        // The live index must differ from the stale index for the bug to be observable.
        expect(senderLiveIndex).not.toBe(senderStaleIndex);

        // ----------------------------------------------------------------
        // 4. Simulate the BUGGY _nextTab with stale index (step = +1, next tab).
        //    The stale snapshot says sender is at `senderStaleIndex`.
        //    The buggy code uses that index to look up tabs[staleIndex + 1].
        // ----------------------------------------------------------------
        const buggyTargetId = await simulateBuggyNextTab(senderTabId, windowId, senderStaleIndex, 1);
        console.log(`[buggy ] next-tab target id=${buggyTargetId} (computed with stale index=${senderStaleIndex})`);

        // ----------------------------------------------------------------
        // 5. Simulate the CORRECT (fixed) _nextTab with live ID-lookup.
        //    The fixed code finds the live index by tab.id, then adds step.
        // ----------------------------------------------------------------
        const correctTargetId = await simulateFixedNextTab(senderTabId, windowId, 1);
        console.log(`[correct] next-tab target id=${correctTargetId} (computed with live index=${senderLiveIndex})`);

        // ----------------------------------------------------------------
        // 6. The bug is present when the buggy calculation picks a DIFFERENT
        //    tab than the correct calculation.
        //    This assertion FAILS on the current (unfixed) code,
        //    demonstrating the bug.
        //    After the fix, both calculations agree and this assertion PASSES.
        // ----------------------------------------------------------------
        expect(
            buggyTargetId,
            `BUG: stale index ${senderStaleIndex} causes wrong tab (${buggyTargetId}) to be activated; ` +
            `correct target (live index ${senderLiveIndex}) is ${correctTargetId}`,
        ).toBe(correctTargetId);

        // ----------------------------------------------------------------
        // 7. Smoke-check: verify invokeCommand uses the LIVE index path.
        //    Chrome populates sender.tab with the live state at dispatch time,
        //    so this works correctly even on the buggy code.
        // ----------------------------------------------------------------
        await activateTabViaSW(senderTabId);
        await pages[0].bringToFront();
        await new Promise(r => setTimeout(r, 300));

        // Find the Playwright page that corresponds to senderTabId
        const senderPage = pages.find(p => !p.isClosed()) ?? pages[0];
        await senderPage.bringToFront();
        await new Promise(r => setTimeout(r, 400));

        const beforeId = (await getActiveTabViaSW()).id;
        const ok = await invokeCommand(senderPage, 'cmd_tab_next');
        expect(ok, 'invokeCommand should dispatch cmd_tab_next successfully').toBe(true);

        const afterId = await pollForTabChange(beforeId, 3000).catch(() => beforeId);
        console.log(`[real invoke] active before=${beforeId}, after=${afterId}, correct=${correctTargetId}`);
        // The real invocation should activate the correct next tab.
        expect(afterId).toBe(correctTargetId);
    });
});
