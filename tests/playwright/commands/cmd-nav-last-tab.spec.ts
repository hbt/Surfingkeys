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

test.describe('cmd_nav_last_tab (Playwright)', () => {
    let pages: Page[] = [];
    let ids: number[] = [];

    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;

        // Create 3 tabs
        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
            pages.push(p);
        }
        cov = await result.covInit();

        // Map each page to its tab ID
        for (const p of pages) {
            const id = await getTabIdForPage(p);
            ids.push(id);
        }
        if (DEBUG) console.log('Tab IDs:', ids);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_nav_last_tab');
        await cov?.close();
        await context?.close();
    });

    test('pressing Ctrl+6 switches to last used tab', async () => {
        // Build history: ids[0] -> ids[1] -> ids[2] (current)
        await activateTabById(ids[0]);
        await activateTabById(ids[1]);
        await activateTabById(ids[2]);
        await pages[2].bringToFront();
        await pages[2].waitForTimeout(300);

        const beforeId = await getActiveTabId();
        expect(beforeId).toBe(ids[2]);

        // Ctrl+6 should switch to ids[1] (last used before ids[2])
        await pages[2].keyboard.press('Control+6');

        const afterId = await pollForTabChange(beforeId);
        expect(afterId).toBe(ids[1]);
        if (DEBUG) console.log(`Ctrl+6 switched from ids[2]=${beforeId} to ids[1]=${afterId}`);
    });

    test('pressing Ctrl+6 twice toggles between two tabs', async () => {
        // Build history: ids[0] -> ids[1] -> ids[2] (current)
        await activateTabById(ids[0]);
        await activateTabById(ids[1]);
        await activateTabById(ids[2]);
        await pages[2].bringToFront();
        await pages[2].waitForTimeout(300);

        const startId = await getActiveTabId();
        expect(startId).toBe(ids[2]);

        // First Ctrl+6 — goes to ids[1]
        await pages[2].keyboard.press('Control+6');
        const afterFirst = await pollForTabChange(startId);
        expect(afterFirst).toBe(ids[1]);

        await pages[1].bringToFront();
        await pages[1].waitForTimeout(600);

        // Second Ctrl+6 — should go back to ids[2]
        await pages[1].keyboard.press('Control+6');
        const afterSecond = await pollForTabChange(afterFirst, 5000);
        expect(afterSecond).toBe(ids[2]);
        if (DEBUG) console.log(`Double Ctrl+6 toggled: ${startId} -> ${afterFirst} -> ${afterSecond}`);
    });

    test('Ctrl+6 navigates to history-based last tab (not position-based)', async () => {
        // Build history: ids[0] -> ids[2] -> ids[1] (current)
        // ids[1] is current, last used was ids[2]
        await activateTabById(ids[0]);
        await activateTabById(ids[2]);
        await activateTabById(ids[1]);
        await pages[1].bringToFront();
        await pages[1].waitForTimeout(300);

        const beforeId = await getActiveTabId();
        expect(beforeId).toBe(ids[1]);

        await pages[1].keyboard.press('Control+6');
        const afterId = await pollForTabChange(beforeId);

        // Should go to ids[2] (history-based last), not ids[0] (position-based previous)
        expect(afterId).toBe(ids[2]);
        if (DEBUG) console.log(`History-based switch: ids[1]=${beforeId} -> ids[2]=${afterId}`);
    });
});
