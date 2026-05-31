/**
 * Scratch test: cmd_chrome_history — CDP approach validation
 *
 * Investigates whether a CDP-backed test can verify that invoking
 * cmd_chrome_history causes a chrome://history tab to be opened.
 *
 * The command path is:
 *   invokeCommand(page, 'cmd_chrome_history')
 *   → content script dispatches __sk_invoke CustomEvent
 *   → tabOpenLink('chrome://history/')
 *   → RUNTIME('openLink', { tab: { tabbed: true }, url: 'chrome://history/' })
 *   → SW: chrome.tabs.create({ url: 'chrome://history/', ... })
 *
 * Key questions being probed:
 *   1. Does chrome.tabs.create({ url: 'chrome://history/' }) succeed in the test env?
 *   2. Does chrome.tabs.query({}) return the new tab?
 *   3. Is the tab URL visible (chrome://history/) or hidden (empty string / chrome://newtab)?
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/cmd-chrome-history-cdp.spec.ts \
 *     --config=playwright.cdp.config.ts
 */

import { test, expect } from '@playwright/test';
import { launchWithCoverage, invokeCommand, FIXTURE_BASE } from '../../playwright/utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

test('cmd_chrome_history — CDP verification probe', async () => {
    const { context, cov } = await launchWithCoverage();

    // Wait for the extension SW
    const sw =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker', { timeout: 10_000 }));
    expect(sw.url()).toContain('background.js');

    // Open a fixture page so invokeCommand bridge is ready
    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // --- PROBE 1: direct SW call — does chrome.tabs.create succeed? ---
    const directResult = await sw.evaluate(() =>
        new Promise<{ ok: boolean; tabId?: number; url?: string; pendingUrl?: string; error?: string }>(resolve => {
            chrome.tabs.create({ url: 'chrome://history/', active: false }, tab => {
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve({
                        ok: true,
                        tabId: tab?.id,
                        url: tab?.url,
                        pendingUrl: tab?.pendingUrl,
                    });
                }
            });
        }),
    );
    console.log('[probe1] chrome.tabs.create direct result:', JSON.stringify(directResult));

    if (!directResult.ok) {
        // The environment blocks chrome:// tab creation — document and skip
        console.log('[probe1] chrome.tabs.create BLOCKED:', directResult.error);
        test.skip(true, `chrome.tabs.create chrome://history/ blocked: ${directResult.error}`);
        await cov?.close();
        await context.close();
        return;
    }

    // --- PROBE 2: query tabs after direct create; check URL visibility ---
    await page.waitForTimeout(800);

    const tabsAfterDirect = await sw.evaluate(() =>
        new Promise<Array<{ id?: number; url?: string; pendingUrl?: string; title?: string }>>(resolve => {
            chrome.tabs.query({}, tabs =>
                resolve(tabs.map(t => ({ id: t.id, url: t.url, pendingUrl: t.pendingUrl, title: t.title }))),
            );
        }),
    );

    const chromeHistoryTab = tabsAfterDirect.find(
        t => (t.url ?? '').includes('chrome://history') || (t.pendingUrl ?? '').includes('chrome://history'),
    );
    console.log('[probe2] All tabs urls:', tabsAfterDirect.map(t => t.url ?? t.pendingUrl ?? '(empty)'));
    console.log('[probe2] Found chrome://history tab:', JSON.stringify(chromeHistoryTab ?? null));

    // Clean up the directly-created tab
    if (directResult.tabId != null) {
        await sw.evaluate((id: number) =>
            new Promise<void>(r => chrome.tabs.remove(id, () => r())),
            directResult.tabId,
        );
        console.log('[probe2] Directly-created tab closed (id=' + directResult.tabId + ')');
    }

    // --- PROBE 3: invoke via command bridge — same outcome? ---
    const tabsBefore = await sw.evaluate(() =>
        new Promise<number>(resolve => chrome.tabs.query({}, tabs => resolve(tabs.length))),
    );

    const invoked = await invokeCommand(page, 'cmd_chrome_history');
    console.log('[probe3] invokeCommand returned:', invoked);
    expect(invoked, 'invokeCommand must acknowledge the command').toBe(true);

    await page.waitForTimeout(1200);

    const tabsAfterCommand = await sw.evaluate(() =>
        new Promise<Array<{ id?: number; url?: string; pendingUrl?: string; title?: string }>>(resolve => {
            chrome.tabs.query({}, tabs =>
                resolve(tabs.map(t => ({ id: t.id, url: t.url, pendingUrl: t.pendingUrl, title: t.title }))),
            );
        }),
    );

    const tabCountAfter = tabsAfterCommand.length;
    console.log('[probe3] Tab count before command:', tabsBefore, '→ after:', tabCountAfter);

    const newChromeTab = tabsAfterCommand.find(
        t => (t.url ?? '').includes('chrome://history') || (t.pendingUrl ?? '').includes('chrome://history'),
    );
    console.log('[probe3] chrome://history tab after command:', JSON.stringify(newChromeTab ?? null));
    console.log('[probe3] All tab urls after command:', tabsAfterCommand.map(t => t.url ?? t.pendingUrl ?? '(empty)'));

    // --- Summary assertions ---

    // At minimum a new tab should have been created
    expect(tabCountAfter, 'at least one new tab should exist after cmd_chrome_history').toBeGreaterThan(tabsBefore);

    // Document whether the URL is visible
    if (newChromeTab) {
        console.log('[result] PASS — chrome://history URL IS visible via tabs API');
        console.log('[result] url=' + newChromeTab.url + ' pendingUrl=' + newChromeTab.pendingUrl);
    } else {
        console.log('[result] NOTE — chrome://history tab URL is NOT visible via tabs API (expected for privileged URLs)');
        console.log('[result] Tab count increased by', tabCountAfter - tabsBefore, '— can assert tab creation but not URL');
    }

    // Clean up: remove all extra tabs beyond the fixture page
    const fixtureTabIds = tabsAfterCommand
        .filter(t => (t.url ?? '').includes('127.0.0.1') || (t.url ?? '').includes('chrome://newtab'))
        .map(t => t.id)
        .filter((id): id is number => id != null);
    const allIds = tabsAfterCommand.map(t => t.id).filter((id): id is number => id != null);
    const toClose = allIds.filter(id => !fixtureTabIds.includes(id));

    if (toClose.length > 0) {
        await sw.evaluate((ids: number[]) =>
            new Promise<void>(r => chrome.tabs.remove(ids, () => r())),
            toClose,
        );
        console.log('[cleanup] Closed', toClose.length, 'extra tab(s)');
    }

    await cov?.close();
    await context.close();
});
