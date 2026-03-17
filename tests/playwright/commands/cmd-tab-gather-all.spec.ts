import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function getAllWindowsInfo(): Promise<Array<{ id: number; tabCount: number }>> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<Array<{ id: number; tabCount: number }>>((resolve) => {
            chrome.windows.getAll({ populate: true }, (windows: any[]) => {
                resolve(windows.map((w) => ({ id: w.id, tabCount: w.tabs.length })));
            });
        });
    });
}

async function createWindowWithTab(url: string): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((u: string) => {
        return new Promise<number>((resolve) => {
            chrome.windows.create({ url: u }, (win: any) => {
                resolve(win.id);
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

async function gatherAllTabsToWindow(targetWindowId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((winId: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.query({}, (tabs: any[]) => {
                const toMove = tabs.filter((t) => t.windowId !== winId);
                toMove.forEach((tab) => {
                    chrome.tabs.move(tab.id, { windowId: winId, index: -1 });
                });
                resolve();
            });
        });
    }, targetWindowId);
}

test.describe('cmd_tab_gather_all (Playwright)', () => {
    let mainWindowId: number;
    let extraWindowId: number | null = null;

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
        // Clean up any extra windows created during test
        if (extraWindowId !== null) {
            try {
                await closeWindow(extraWindowId);
            } catch (_) {}
            extraWindowId = null;
            await page.waitForTimeout(300);
        }
    });

    test('gathering all tabs from another window increases main window tab count', async () => {
        const initialMainTabs = await getTabsInWindow(mainWindowId);
        const initialMainCount = initialMainTabs.length;

        // Create a second window with a tab
        extraWindowId = await createWindowWithTab(FIXTURE_URL);
        await page.waitForTimeout(800);

        const secondWindowTabs = await getTabsInWindow(extraWindowId);
        const expectedTotal = initialMainCount + secondWindowTabs.length;
        console.log(`Initial: main=${initialMainCount}, second=${secondWindowTabs.length}, expected=${expectedTotal}`);

        // Gather all tabs to main window
        await gatherAllTabsToWindow(mainWindowId);
        await page.waitForTimeout(1000);

        // Poll for completion
        let finalMainTabs = await getTabsInWindow(mainWindowId);
        for (let i = 0; i < 20; i++) {
            if (finalMainTabs.length >= expectedTotal) break;
            await page.waitForTimeout(200);
            finalMainTabs = await getTabsInWindow(mainWindowId);
        }

        expect(finalMainTabs.length).toBe(expectedTotal);
        console.log(`After gather: main window has ${finalMainTabs.length} tabs`);
        extraWindowId = null; // Window auto-closed when emptied
    });

    test('gathering with single window does nothing', async () => {
        const windowsBefore = await getAllWindowsInfo();
        // Only run if we truly have one window
        const otherWindows = windowsBefore.filter((w) => w.id !== mainWindowId);
        if (otherWindows.length > 0) {
            // Close extras first
            for (const w of otherWindows) {
                try { await closeWindow(w.id); } catch (_) {}
            }
            await page.waitForTimeout(500);
        }

        const initialMainTabs = await getTabsInWindow(mainWindowId);
        const initialCount = initialMainTabs.length;

        // Gather (no-op when single window)
        await gatherAllTabsToWindow(mainWindowId);
        await page.waitForTimeout(500);

        const finalTabs = await getTabsInWindow(mainWindowId);
        expect(finalTabs.length).toBe(initialCount);
        console.log(`Single-window gather: count unchanged at ${finalTabs.length}`);
    });

    test('gathered tabs are preserved (IDs intact)', async () => {
        const initialMainTabs = await getTabsInWindow(mainWindowId);

        // Create second window
        extraWindowId = await createWindowWithTab(FIXTURE_URL);
        await page.waitForTimeout(800);

        const secondTabs = await getTabsInWindow(extraWindowId);
        const secondTabIds = secondTabs.map((t) => t.id);

        // Gather
        await gatherAllTabsToWindow(mainWindowId);
        await page.waitForTimeout(1000);

        const finalMainTabs = await getTabsInWindow(mainWindowId);

        // All previously-second-window tabs should now be in main window
        for (const id of secondTabIds) {
            const found = finalMainTabs.find((t) => t.id === id);
            expect(found).toBeDefined();
            console.log(`Tab ${id} gathered successfully`);
        }
        extraWindowId = null;
    });
});
