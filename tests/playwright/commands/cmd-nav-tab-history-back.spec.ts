import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let cov: ServiceWorkerCoverage | undefined;

async function getActiveTabId(): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                resolve(tabs[0]?.id ?? -1);
            });
        });
    });
}

async function getTabIdForPage(p: Page): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    // Bring the page to front so it becomes active, then read its ID
    await p.bringToFront();
    await p.waitForTimeout(300);
    return getActiveTabId();
}

async function activateTabById(tabId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { active: true }, () => resolve());
        });
    }, tabId);
    await new Promise(r => setTimeout(r, 400));
}

async function pollForTabChange(fromTabId: number, maxMs = 3000): Promise<number> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
        const currentId = await getActiveTabId();
        if (currentId !== fromTabId) return currentId;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Tab did not change from ${fromTabId} within ${maxMs}ms`);
}

test.describe('cmd_nav_tab_history_back (Playwright)', () => {
    let pages: Page[] = [];
    let ids: number[] = [];  // tab IDs in the same order as pages[]

    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;

        // Create 5 tabs
        for (let i = 0; i < 5; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            cov = await result.covInit();
        await p.waitForTimeout(200);
            pages.push(p);
        }

        // Map each page to its tab ID by activating each page in turn
        for (const p of pages) {
            const id = await getTabIdForPage(p);
            ids.push(id);
        }
        if (DEBUG) console.log('Tab IDs:', ids);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_nav_tab_history_back');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        // Build history: ids[0] -> ids[1] -> ids[2] -> ids[3] -> ids[4] (current)
        for (let i = 0; i < 5; i++) {
            await activateTabById(ids[i]);
        }
        await pages[4].bringToFront();
        await pages[4].waitForTimeout(300);

        // Verify current tab
        const currentId = await getActiveTabId();
        expect(currentId).toBe(ids[4]);
    });

    test('pressing B goes back to previously active tab', async () => {
        const initialId = await getActiveTabId();
        expect(initialId).toBe(ids[4]);

        // Press B — should go back to ids[3]
        await pages[4].keyboard.press('B');

        const afterId = await pollForTabChange(initialId);
        expect(afterId).toBe(ids[3]);
        if (DEBUG) console.log(`B switched from ids[4]=${initialId} to ids[3]=${afterId}`);
    });

    test('pressing B twice goes back two steps in tab history', async () => {
        const initialId = await getActiveTabId();
        expect(initialId).toBe(ids[4]);

        // First B: ids[4] -> ids[3]
        await pages[4].keyboard.press('B');
        const afterFirst = await pollForTabChange(initialId);
        expect(afterFirst).toBe(ids[3]);

        await pages[3].bringToFront();
        await pages[3].waitForTimeout(400);

        // Second B: ids[3] -> ids[2]
        await pages[3].keyboard.press('B');
        const afterSecond = await pollForTabChange(afterFirst, 5000);
        expect(afterSecond).toBe(ids[2]);
        if (DEBUG) console.log(`Two B presses: ids[4] -> ids[3] -> ids[2]`);
    });

    test('B command leaves browser in a valid state', async () => {
        const initialId = await getActiveTabId();

        await pages[4].keyboard.press('B');
        await pages[4].waitForTimeout(1000);

        const afterId = await getActiveTabId();
        expect(afterId).toBeDefined();
        expect(ids).toContain(afterId);
        if (DEBUG) console.log(`After B: still valid tab ${afterId}`);
    });
});
