import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_move_window';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getActiveTabInfo(): Promise<{ id: number; index: number; windowId: number }> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<{ id: number; index: number; windowId: number }>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                resolve({ id: tabs[0].id, index: tabs[0].index, windowId: tabs[0].windowId });
            });
        });
    });
}

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

async function moveTabToWindow(tabId: number, windowId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(({ tid, wid }: { tid: number; wid: number }) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.move(tid, { windowId: wid, index: -1 }, () => resolve());
        });
    }, { tid: tabId, wid: windowId });
}

async function findTabById(tabId: number): Promise<{ id: number; windowId: number } | null> {
    const sw = context.serviceWorkers()[0];
    if (!sw) return null;
    return sw.evaluate((id: number) => {
        return new Promise<{ id: number; windowId: number } | null>((resolve) => {
            chrome.tabs.get(id, (tab: any) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve({ id: tab.id, windowId: tab.windowId });
                }
            });
        });
    }, tabId);
}

test.describe('cmd_tab_move_window (Playwright)', () => {
    let mainWindowId: number;
    const createdWindowIds: number[] = [];

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        const info = await getActiveTabInfo();
        mainWindowId = info.windowId;
        if (DEBUG) console.log(`Main window ID: ${mainWindowId}`);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        for (const wid of createdWindowIds.splice(0)) {
            try { await closeWindow(wid); } catch (_) {}
        }
        // Use a SW-based wait instead of page.waitForTimeout (page may be closed)
        const sw = context.serviceWorkers()[0];
        if (sw) {
            await sw.evaluate(() => new Promise<void>((r) => setTimeout(r, 300)));
        }
    });

    test('W command executes without error (smoke test)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Create a second window so W has somewhere to go
            const win2 = await createWindowWithTab(FIXTURE_URL);
            createdWindowIds.push(win2);
            await page.waitForTimeout(500);

            await page.bringToFront();
            await page.waitForTimeout(300);

            const initialInfo = await getActiveTabInfo();
            const windows = await getAllWindowsInfo();
            if (DEBUG) console.log(`Windows: ${windows.length}`);
            expect(windows.length).toBeGreaterThanOrEqual(2);

            // Press W to trigger the window selection command
            await page.keyboard.press('W');
            await page.waitForTimeout(500);

            // Press Escape to dismiss any omnibar that opened
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(300);

            // Browser should still be valid
            const afterInfo = await getActiveTabInfo();
            expect(afterInfo.id).toBeGreaterThan(0);
            if (DEBUG) console.log(`W smoke test: tab ${initialInfo.id} still valid, active=${afterInfo.id}`);
        });
    });

    test('moving tab to another window via SW API works correctly', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Create a second window
            const win2 = await createWindowWithTab(FIXTURE_URL);
            createdWindowIds.push(win2);
            await page.waitForTimeout(500);

            const mainTabs = await getTabsInWindow(mainWindowId);
            const tabToMove = mainTabs[0];
            const tabId = tabToMove.id;

            const initialMainCount = mainTabs.length;
            const initialWin2Count = (await getTabsInWindow(win2)).length;

            if (DEBUG) console.log(`Moving tab ${tabId} from main window to window ${win2}`);

            // Move the tab
            await moveTabToWindow(tabId, win2);
            await page.waitForTimeout(500);

            // Poll for tab to appear in win2
            let movedTab: { id: number; windowId: number } | null = null;
            for (let i = 0; i < 15; i++) {
                movedTab = await findTabById(tabId);
                if (movedTab && movedTab.windowId === win2) break;
                await page.waitForTimeout(200);
            }

            expect(movedTab).not.toBeNull();
            expect(movedTab!.windowId).toBe(win2);

            const finalMainCount = (await getTabsInWindow(mainWindowId)).length;
            const finalWin2Count = (await getTabsInWindow(win2)).length;
            expect(finalMainCount).toBe(initialMainCount - 1);
            expect(finalWin2Count).toBe(initialWin2Count + 1);
            if (DEBUG) console.log(`Tab moved: main ${initialMainCount}->${finalMainCount}, win2 ${initialWin2Count}->${finalWin2Count}`);
        });
    });

    test('moving tab back and forth between windows preserves tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Create a second window
            const win2 = await createWindowWithTab(FIXTURE_URL);
            createdWindowIds.push(win2);
            await page.waitForTimeout(500);

            // Create a fresh tab in the main window to move (avoids conflicts with page tabs)
            const sw = context.serviceWorkers()[0];
            if (!sw) throw new Error('No service worker');
            const tabId: number = await sw.evaluate(({ url, winId }: { url: string; winId: number }) => {
                return new Promise<number>((resolve) => {
                    chrome.tabs.create({ url, windowId: winId }, (tab: any) => resolve(tab.id));
                });
            }, { url: FIXTURE_URL, winId: mainWindowId });
            await page.waitForTimeout(500);

            // Move to win2
            await moveTabToWindow(tabId, win2);
            // Poll until tab appears in win2
            let tab: { id: number; windowId: number } | null = null;
            for (let i = 0; i < 15; i++) {
                tab = await findTabById(tabId);
                if (tab && tab.windowId === win2) break;
                const sw = context.serviceWorkers()[0];
                if (sw) await sw.evaluate(() => new Promise<void>((r) => setTimeout(r, 200)));
            }
            expect(tab!.windowId).toBe(win2);
            if (DEBUG) console.log(`Tab ${tabId} moved to window ${win2}`);

            // Move back to main
            await moveTabToWindow(tabId, mainWindowId);
            // Poll until tab appears in main window
            for (let i = 0; i < 15; i++) {
                tab = await findTabById(tabId);
                if (tab && tab.windowId === mainWindowId) break;
                const sw = context.serviceWorkers()[0];
                if (sw) await sw.evaluate(() => new Promise<void>((r) => setTimeout(r, 200)));
            }
            expect(tab!.windowId).toBe(mainWindowId);
            if (DEBUG) console.log(`Tab ${tabId} moved back to main window ${mainWindowId}`);
        });
    });
});
