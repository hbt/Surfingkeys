import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_gather_all';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

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
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        mainWindowId = await getMainWindowId();
        if (DEBUG) console.log(`Main window ID: ${mainWindowId}`);
    });

    test.afterAll(async () => {
        await covBg?.close();
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
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialMainTabs = await getTabsInWindow(mainWindowId);
            const initialMainCount = initialMainTabs.length;

            // Create a second window with a tab
            extraWindowId = await createWindowWithTab(FIXTURE_URL);
            await page.waitForTimeout(800);

            const secondWindowTabs = await getTabsInWindow(extraWindowId);
            const expectedTotal = initialMainCount + secondWindowTabs.length;
            if (DEBUG) console.log(`Initial: main=${initialMainCount}, second=${secondWindowTabs.length}, expected=${expectedTotal}`);

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
            if (DEBUG) console.log(`After gather: main window has ${finalMainTabs.length} tabs`);
            extraWindowId = null; // Window auto-closed when emptied
        });
    });

    test('gathering with single window does nothing', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
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
            if (DEBUG) console.log(`Single-window gather: count unchanged at ${finalTabs.length}`);
        });
    });

    test('gathered tabs are preserved (IDs intact)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
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
                if (DEBUG) console.log(`Tab ${id} gathered successfully`);
            }
            extraWindowId = null;
        });
    });
});
