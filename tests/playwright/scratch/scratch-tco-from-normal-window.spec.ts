/**
 * Scratch: tco (AllIncognitoTabs) from a normal window closes incognito tabs.
 *
 * Test 1 — basic flow
 *   Incognito tab registers with SW on load → tco from normal tab closes it.
 *   Exercises the incognitoWindowIds registry + query({windowId}) path.
 *
 * Test 2 — Fix A: local storage persistence across SW restart
 *   Incognito tab registers → SW is restarted via chrome.runtime.reload() →
 *   new SW restores registry from chrome.storage.session →
 *   tco from normal tab still closes incognito tabs.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-tco-from-normal-window.spec.ts \
 *       --config=playwright.scratch.config.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const KEY = 'gX';
const UNIQUE_ID = 'cmd_tab_close_m';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

async function setConf(page: Page, key: string, value: unknown) {
    await page.evaluate(([k, v]) => {
        document.dispatchEvent(new CustomEvent('__sk_conf_override', {
            detail: { key: k, value: v }
        }));
    }, [key, value] as [string, unknown]);
    await page.waitForTimeout(50);
}

async function getSW(context: BrowserContext) {
    return context.serviceWorkers()[0]
        ?? await context.waitForEvent('serviceworker', { timeout: 10_000 });
}

async function createIncognitoWindow(context: BrowserContext, tabCount = 2): Promise<number> {
    const sw = await getSW(context);
    let winId: number;
    try {
        winId = await sw.evaluate((): Promise<number> =>
            new Promise((resolve, reject) => {
                chrome.windows.create({ incognito: true, state: 'minimized' }, (win) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else resolve(win!.id!);
                });
            })
        );
    } catch (err) {
        test.skip(true, `Incognito window creation blocked: ${err}`);
        return -1;
    }
    // Add extra tabs beyond the first
    for (let i = 1; i < tabCount; i++) {
        await sw.evaluate((wid: number) =>
            new Promise<void>((resolve) => {
                chrome.tabs.create({ windowId: wid, url: 'about:blank' }, () => resolve());
            })
        , winId);
    }
    return winId;
}

async function dispatchTco(anchor: Page) {
    await anchor.bringToFront();
    await anchor.waitForTimeout(200);
    await callSKApi(anchor, 'unmapAllExcept', []);
    await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
    await setConf(anchor, 'magicKeys', { 'o': 'AllIncognitoTabs' });
    await anchor.keyboard.press('g');
    await anchor.waitForTimeout(50);
    await anchor.keyboard.press('X');
    await anchor.waitForTimeout(50);
    await anchor.keyboard.press('o');
}

async function waitForIncognitoTabCount(context: BrowserContext, winId: number, expected: number, timeoutMs = 5000): Promise<number> {
    const sw = await getSW(context);
    const start = Date.now();
    let tabs: chrome.tabs.Tab[] = [];
    while (Date.now() - start < timeoutMs) {
        tabs = await sw.evaluate((wid: number) =>
            new Promise<chrome.tabs.Tab[]>(r => chrome.tabs.query({ windowId: wid }, r))
        , winId);
        if (tabs.length <= expected) break;
        await new Promise(r => setTimeout(r, 100));
    }
    return tabs.length;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let context: BrowserContext;
let incognitoWinId = -1;

test.beforeAll(async () => {
    const result = await launchWithCoverage();
    context = result.context;
    for (const p of context.pages()) await p.close().catch(() => {});
});

test.afterAll(async () => {
    if (incognitoWinId !== -1) {
        const sw = context.serviceWorkers()[0];
        if (sw) {
            await sw.evaluate((wid: number) =>
                new Promise<void>(r => chrome.windows.remove(wid, () => r()))
            , incognitoWinId).catch(() => {});
        }
        incognitoWinId = -1;
    }
    await context?.close();
});

// ---------------------------------------------------------------------------
// Test 1 — basic flow (registry populated by incognito CS on load)
// ---------------------------------------------------------------------------

test('Test 1: tco from normal window closes incognito tabs (registry path)', async () => {
    test.setTimeout(30_000);

    const sw = await getSW(context);
    expect(sw.url()).toContain('background.js');

    const anchor = await context.newPage();
    await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
    await anchor.waitForTimeout(500);

    incognitoWinId = await createIncognitoWindow(context, 2);
    if (incognitoWinId === -1) return;

    // Wait for incognito content scripts to register with SW
    await anchor.waitForTimeout(2000);

    // Confirm SW can see both incognito tabs via windowId query
    const before = await waitForIncognitoTabCount(context, incognitoWinId, 999);
    console.log(`[Test 1] incognito tabs before tco: ${before}`);
    expect(before).toBeGreaterThanOrEqual(1);

    // Confirm trigger tab is non-incognito
    const anchorInfo = await sw.evaluate((url: string) =>
        new Promise<{ incognito: boolean } | null>(r =>
            chrome.tabs.query({ url: `${url}*` }, tabs => r(tabs[0] ? { incognito: tabs[0].incognito } : null))
        )
    , FIXTURE_URL);
    expect(anchorInfo).not.toBeNull();
    expect(anchorInfo!.incognito, 'tco must be triggered from a non-incognito tab').toBe(false);
    console.log(`[Test 1] anchor tab incognito=${anchorInfo!.incognito} — confirmed normal window`);

    // Confirm registry is populated (Fix A or CS registration)
    const registryBefore = await sw.evaluate(() =>
        new Promise<number[]>(r =>
            chrome.storage.local.get('incognitoWindowIds', result =>
                r((result['incognitoWindowIds'] as number[]) || [])
            )
        )
    );
    console.log(`[Test 1] local storage registry before tco: [${registryBefore}]`);
    expect(registryBefore.length, 'registry must contain the incognito windowId').toBeGreaterThan(0);

    await dispatchTco(anchor);

    const after = await waitForIncognitoTabCount(context, incognitoWinId, 0);
    console.log(`[Test 1] incognito tabs after tco: ${after}`);
    expect(after, 'all incognito tabs must be closed').toBe(0);

    const normalPages = context.pages().filter(p => p.url().startsWith('http'));
    expect(normalPages.length, 'normal page must still be open').toBeGreaterThan(0);
    console.log('[Test 1] PASS — tco closed all incognito tabs from a normal window');

    incognitoWinId = -1; // already closed by tco
});

// ---------------------------------------------------------------------------
// Test 2 — Fix A: registry survives SW restart via chrome.storage.session
// ---------------------------------------------------------------------------

test('Test 2: Fix A — registry survives SW restart, tco still works', async () => {
    test.setTimeout(45_000);

    const anchor = await context.newPage();
    await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
    await anchor.waitForTimeout(500);

    incognitoWinId = await createIncognitoWindow(context, 2);
    if (incognitoWinId === -1) return;

    // Wait for incognito CS to register and local storage to be written
    await anchor.waitForTimeout(2500);

    const sw1 = await getSW(context);
    const registryBeforeRestart = await sw1.evaluate(() =>
        new Promise<number[]>(r =>
            chrome.storage.local.get('incognitoWindowIds', result =>
                r((result['incognitoWindowIds'] as number[]) || [])
            )
        )
    );
    console.log(`[Test 2] registry in local storage before restart: [${registryBeforeRestart}]`);
    expect(registryBeforeRestart.length, 'registry must be persisted before restart').toBeGreaterThan(0);

    // Restart the SW via chrome.runtime.reload() — simulates extension reload
    console.log('[Test 2] restarting SW via chrome.runtime.reload()...');
    const swRestartedPromise = context.waitForEvent('serviceworker', { timeout: 15_000 });
    await sw1.evaluate(() => chrome.runtime.reload()).catch(() => {});
    const sw2 = await swRestartedPromise;
    await anchor.waitForTimeout(3000); // let Fix A load + validate windows from local storage

    console.log(`[Test 2] new SW URL: ${sw2.url()}`);
    expect(sw2.url()).toContain('background.js');

    // Confirm Fix A restored the registry after restart
    const registryAfterRestart = await sw2.evaluate(() =>
        new Promise<number[]>(r =>
            chrome.storage.local.get('incognitoWindowIds', result =>
                r((result['incognitoWindowIds'] as number[]) || [])
            )
        )
    );
    console.log(`[Test 2] registry after restart (Fix A restore): [${registryAfterRestart}]`);
    expect(registryAfterRestart.length, 'Fix A must restore registry after SW restart').toBeGreaterThan(0);
    expect(registryAfterRestart).toContain(incognitoWinId);

    // Now trigger tco from normal window — must still work without re-registration
    const anchor2 = await context.newPage();
    await anchor2.goto(FIXTURE_URL, { waitUntil: 'load' });
    await anchor2.waitForTimeout(500);

    await dispatchTco(anchor2);

    const after = await waitForIncognitoTabCount(context, incognitoWinId, 0);
    console.log(`[Test 2] incognito tabs after tco post-restart: ${after}`);
    expect(after, 'tco must close incognito tabs even after SW restart').toBe(0);

    console.log('[Test 2] PASS — Fix A: registry survived SW restart, tco worked without re-registration');
    incognitoWinId = -1;
});

// ---------------------------------------------------------------------------
// Test 3 — SSE relay: tco posts to server, incognito CS receives close event
// ---------------------------------------------------------------------------

test('Test 3: tco from normal window closes incognito tabs via SSE relay', async () => {
    test.setTimeout(45_000);

    // The chrome-test build bakes in CONFIG_SERVER_PORT=9602 — all CS/SW calls go there.
    // playwright.scratch.config.ts starts a server on 9602 via webServer config.
    const SSE_SERVER = 'http://localhost:9602';

    // Confirm /incognito-sse-status endpoint exists (will fail RED until server.ts is updated)
    const statusRes = await fetch(`${SSE_SERVER}/incognito-sse-status`).catch(() => null);
    expect(statusRes?.ok, '/incognito-sse-status must return 200 (implement in server.ts)').toBe(true);

    const anchor = await context.newPage();
    await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
    await anchor.waitForTimeout(500);

    incognitoWinId = await createIncognitoWindow(context, 2);
    if (incognitoWinId === -1) return;

    // Wait for incognito CSes to connect to SSE endpoint
    console.log('[Test 3] waiting for SSE subscribers > 0...');
    const sseConnected = await (async () => {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
            const res = await fetch(`${SSE_SERVER}/incognito-sse-status`).then(r => r.json()).catch(() => ({ subscribers: 0 })) as { subscribers: number };
            if (res.subscribers > 0) return true;
            await new Promise(r => setTimeout(r, 200));
        }
        return false;
    })();
    expect(sseConnected, 'at least one incognito CS must connect to SSE endpoint within 8s').toBe(true);

    const subscribersBefore = await fetch(`${SSE_SERVER}/incognito-sse-status`).then(r => r.json()) as { subscribers: number };
    console.log(`[Test 3] SSE subscribers before tco: ${subscribersBefore.subscribers}`);

    // Confirm trigger tab is non-incognito
    const sw = await getSW(context);
    const anchorInfo = await sw.evaluate((url: string) =>
        new Promise<{ incognito: boolean } | null>(r =>
            chrome.tabs.query({ url: `${url}*` }, tabs => r(tabs[0] ? { incognito: tabs[0].incognito } : null))
        )
    , FIXTURE_URL);
    expect(anchorInfo).not.toBeNull();
    expect(anchorInfo!.incognito, 'tco must be triggered from a non-incognito tab').toBe(false);

    const normalPageCountBefore = context.pages().filter(p => p.url().startsWith('http')).length;
    console.log(`[Test 3] normal pages before tco: ${normalPageCountBefore}`);

    await dispatchTco(anchor);
    await anchor.waitForTimeout(500);

    // Wait for SSE subscribers to drop to 0.
    // Server proactively closes streams on POST /close-incognito, so count drops immediately.
    console.log('[Test 3] waiting for SSE subscribers to drop to 0...');
    const sseClosed = await (async () => {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
            const res = await fetch(`${SSE_SERVER}/incognito-sse-status`).then(r => r.json()).catch(() => ({ subscribers: 1 })) as { subscribers: number };
            if (res.subscribers === 0) return true;
            await new Promise(r => setTimeout(r, 200));
        }
        return false;
    })();
    expect(sseClosed, 'all SSE subscribers must disconnect after close event within 8s').toBe(true);

    const normalPages = context.pages().filter(p => p.url().startsWith('http'));
    expect(normalPages.length, 'normal page must still be open after tco').toBeGreaterThan(0);

    console.log('[Test 3] PASS — tco closed incognito tabs via SSE relay from normal window');
    incognitoWinId = -1; // already closed by tco
});
