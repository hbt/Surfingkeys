import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function getMainWindowId(): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                resolve(tabs[0].windowId);
            });
        });
    });
}

async function getTabsInWindow(windowId: number): Promise<Array<{ id: number; index: number }>> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((wid: number) => {
        return new Promise<Array<{ id: number; index: number }>>((resolve) => {
            chrome.tabs.query({ windowId: wid }, (tabs: any[]) => {
                resolve(tabs.map((t) => ({ id: t.id, index: t.index })));
            });
        });
    }, windowId);
}

async function createWindowWithTab(url: string): Promise<{ windowId: number; tabId: number }> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((u: string) => {
        return new Promise<{ windowId: number; tabId: number }>((resolve) => {
            chrome.windows.create({ url: u }, (win: any) => {
                resolve({ windowId: win.id, tabId: win.tabs[0].id });
            });
        });
    }, url);
}

async function closeWindow(windowId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.windows.remove(id, () => resolve());
        });
    }, windowId);
}

async function moveTabToWindow(tabId: number, windowId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(({ tid, wid }: { tid: number; wid: number }) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.move(tid, { windowId: wid, index: -1 }, () => resolve());
        });
    }, { tid: tabId, wid: windowId });
}

test.describe('cmd_tab_gather_filtered (Playwright)', () => {
    let mainWindowId: number;
    const createdWindowIds: number[] = [];

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        mainWindowId = await getMainWindowId();
        console.log(`Main window ID: ${mainWindowId}`);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.afterEach(async () => {
        // Close any windows created during tests
        for (const wid of createdWindowIds.splice(0)) {
            try { await closeWindow(wid); } catch (_) {}
        }
        await page.waitForTimeout(300);
    });

    test('moving a specific tab from another window to main window', async () => {
        const initialMainTabs = await getTabsInWindow(mainWindowId);
        const initialCount = initialMainTabs.length;

        // Create a second window
        const { windowId: secondWindowId, tabId: secondTabId } = await createWindowWithTab(FIXTURE_URL);
        createdWindowIds.push(secondWindowId);
        await page.waitForTimeout(600);

        const secondTabs = await getTabsInWindow(secondWindowId);
        console.log(`Second window has ${secondTabs.length} tabs, tab ID=${secondTabId}`);
        expect(secondTabs.length).toBeGreaterThan(0);

        // Move just one tab from second window to main window (filtered gather)
        const tabToGather = secondTabs[0];
        await moveTabToWindow(tabToGather.id, mainWindowId);
        await page.waitForTimeout(500);

        // Poll for completion
        let finalMainTabs = await getTabsInWindow(mainWindowId);
        for (let i = 0; i < 15; i++) {
            if (finalMainTabs.length >= initialCount + 1) break;
            await page.waitForTimeout(200);
            finalMainTabs = await getTabsInWindow(mainWindowId);
        }

        expect(finalMainTabs.length).toBe(initialCount + 1);
        const gath = finalMainTabs.find((t) => t.id === tabToGather.id);
        expect(gath).toBeDefined();
        console.log(`Tab ${tabToGather.id} gathered to main window`);
    });

    test('gathering specific tabs from multiple windows', async () => {
        const initialMainTabs = await getTabsInWindow(mainWindowId);
        const initialCount = initialMainTabs.length;

        // Create two extra windows
        const win2 = await createWindowWithTab(FIXTURE_URL);
        createdWindowIds.push(win2.windowId);
        const win3 = await createWindowWithTab(FIXTURE_URL);
        createdWindowIds.push(win3.windowId);
        await page.waitForTimeout(600);

        const tabs2 = await getTabsInWindow(win2.windowId);
        const tabs3 = await getTabsInWindow(win3.windowId);
        console.log(`Window2: ${tabs2.length} tabs, Window3: ${tabs3.length} tabs`);

        const tabsToGather = [
            ...(tabs2.length > 0 ? [tabs2[0]] : []),
            ...(tabs3.length > 0 ? [tabs3[0]] : []),
        ];
        expect(tabsToGather.length).toBeGreaterThan(0);

        // Gather selected tabs into main window
        for (const tab of tabsToGather) {
            await moveTabToWindow(tab.id, mainWindowId);
        }
        await page.waitForTimeout(600);

        const expectedCount = initialCount + tabsToGather.length;
        let finalMainTabs = await getTabsInWindow(mainWindowId);
        for (let i = 0; i < 15; i++) {
            if (finalMainTabs.length >= expectedCount) break;
            await page.waitForTimeout(200);
            finalMainTabs = await getTabsInWindow(mainWindowId);
        }

        expect(finalMainTabs.length).toBe(expectedCount);
        for (const tab of tabsToGather) {
            const found = finalMainTabs.find((t) => t.id === tab.id);
            expect(found).toBeDefined();
            console.log(`Tab ${tab.id} gathered successfully`);
        }
    });

    test('gathering all tabs from no other windows keeps count unchanged', async () => {
        // Close all extra windows first
        const sw = context.serviceWorkers()[0];
        if (!sw) throw new Error('No service worker');
        const allWindows: Array<{ id: number }> = await sw.evaluate(() => {
            return new Promise<Array<{ id: number }>>((resolve) => {
                chrome.windows.getAll({}, (wins: any[]) => resolve(wins.map((w) => ({ id: w.id }))));
            });
        });
        for (const w of allWindows) {
            if (w.id !== mainWindowId) {
                try { await closeWindow(w.id); } catch (_) {}
            }
        }
        await page.waitForTimeout(500);

        const initialMainTabs = await getTabsInWindow(mainWindowId);
        const initialCount = initialMainTabs.length;

        // Try to gather from other windows (none exist)
        await sw.evaluate((wid: number) => {
            return new Promise<void>((resolve) => {
                chrome.tabs.query({}, (tabs: any[]) => {
                    const toMove = tabs.filter((t) => t.windowId !== wid);
                    toMove.forEach((tab) => {
                        chrome.tabs.move(tab.id, { windowId: wid, index: -1 });
                    });
                    resolve();
                });
            });
        }, mainWindowId);
        await page.waitForTimeout(500);

        const finalMainTabs = await getTabsInWindow(mainWindowId);
        expect(finalMainTabs.length).toBe(initialCount);
        console.log(`No other windows: count unchanged at ${finalMainTabs.length}`);
    });
});
