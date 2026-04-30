import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function getActiveTabInfo(): Promise<{ id: number; muted: boolean }> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<{ id: number; muted: boolean }>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                resolve({
                    id: tabs[0].id,
                    muted: tabs[0].mutedInfo?.muted ?? false,
                });
            });
        });
    });
}

async function getTabMuteState(tabId: number): Promise<boolean> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((id: number) => {
        return new Promise<boolean>((resolve) => {
            chrome.tabs.get(id, (tab: any) => {
                resolve(tab?.mutedInfo?.muted ?? false);
            });
        });
    }, tabId);
}

async function setTabMuteState(tabId: number, muted: boolean): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(({ id, m }: { id: number; m: boolean }) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { muted: m }, () => resolve());
        });
    }, { id: tabId, m: muted });
}

async function toggleMute(tabId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.get(id, (tab: any) => {
                chrome.tabs.update(id, { muted: !tab.mutedInfo.muted }, () => resolve());
            });
        });
    }, tabId);
}

test.describe('cmd_tab_mute_toggle (Playwright)', () => {
    let testTabId: number;

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        const info = await getActiveTabInfo();
        testTabId = info.id;
        if (DEBUG) console.log(`Test tab ID: ${testTabId}`);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        // Reset: ensure tab is unmuted before each test
        await setTabMuteState(testTabId, false);
        await page.waitForTimeout(200);
    });

    test('muting an unmuted tab changes muted state to true', async () => {
        const initialMuted = await getTabMuteState(testTabId);
        expect(initialMuted).toBe(false);

        // Toggle mute (unmuted -> muted)
        await toggleMute(testTabId);
        await page.waitForTimeout(200);

        const afterMute = await getTabMuteState(testTabId);
        expect(afterMute).toBe(true);
        if (DEBUG) console.log(`Mute toggle: false -> ${afterMute}`);
    });

    test('unmuting a muted tab changes muted state to false', async () => {
        // First mute the tab
        await setTabMuteState(testTabId, true);
        await page.waitForTimeout(200);

        const preMuted = await getTabMuteState(testTabId);
        expect(preMuted).toBe(true);

        // Toggle mute (muted -> unmuted)
        await toggleMute(testTabId);
        await page.waitForTimeout(200);

        const afterToggle = await getTabMuteState(testTabId);
        expect(afterToggle).toBe(false);
        if (DEBUG) console.log(`Unmute toggle: true -> ${afterToggle}`);
    });

    test('toggling mute multiple times cycles state correctly', async () => {
        // Start: unmuted
        expect(await getTabMuteState(testTabId)).toBe(false);

        // Toggle 1: false -> true
        await toggleMute(testTabId);
        await page.waitForTimeout(200);
        expect(await getTabMuteState(testTabId)).toBe(true);

        // Toggle 2: true -> false
        await toggleMute(testTabId);
        await page.waitForTimeout(200);
        expect(await getTabMuteState(testTabId)).toBe(false);

        // Toggle 3: false -> true
        await toggleMute(testTabId);
        await page.waitForTimeout(200);
        expect(await getTabMuteState(testTabId)).toBe(true);

        if (DEBUG) console.log(`Toggle cycle: false -> true -> false -> true`);
    });

    test('pressing Alt-m key sequence changes mute state', async () => {
        // This tests the actual keyboard shortcut through Surfingkeys
        await page.bringToFront();
        await page.waitForTimeout(300);

        const initialMuted = await getTabMuteState(testTabId);
        if (DEBUG) console.log(`Initial muted: ${initialMuted}`);

        // Send Alt+m
        await page.keyboard.press('Alt+m');
        await page.waitForTimeout(500);

        const afterMuted = await getTabMuteState(testTabId);
        if (DEBUG) console.log(`After Alt+m: muted=${afterMuted}`);

        // The mute state should have changed
        expect(afterMuted).not.toBe(initialMuted);
    });
});
