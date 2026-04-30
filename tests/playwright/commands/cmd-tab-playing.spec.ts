import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

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

async function getAudibleTabs(): Promise<Array<{ id: number; index: number }>> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<Array<{ id: number; index: number }>>((resolve) => {
            chrome.tabs.query({ audible: true, currentWindow: true }, (tabs: any[]) => {
                resolve(tabs.map((t) => ({ id: t.id, index: t.index })));
            });
        });
    });
}

test.describe('cmd_tab_playing (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing gp when no tab is audible keeps current tab active', async () => {
        await page.bringToFront();
        await page.waitForTimeout(300);

        const initialId = await getActiveTabId();
        if (DEBUG) console.log(`Initial tab: ${initialId}`);

        // Verify no audible tabs
        const audibleTabs = await getAudibleTabs();
        if (DEBUG) console.log(`Audible tabs: ${audibleTabs.length}`);
        expect(audibleTabs.length).toBe(0);

        // Send gp
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('p');
        await page.waitForTimeout(1000);

        // Should remain on the same tab
        const finalId = await getActiveTabId();
        if (DEBUG) console.log(`After gp with no audible tabs: ${finalId}`);
        expect(finalId).toBe(initialId);
    });

    test('pressing gp executes without errors', async () => {
        await page.bringToFront();
        await page.waitForTimeout(300);

        const initialId = await getActiveTabId();
        expect(initialId).toBeGreaterThan(0);

        // Send gp
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('p');
        await page.waitForTimeout(800);

        // Browser should still have a valid active tab
        const afterId = await getActiveTabId();
        expect(afterId).toBeGreaterThan(0);
        if (DEBUG) console.log(`gp smoke test: ${initialId} -> ${afterId}`);
    });

    test('gp with multiple tabs does not crash', async () => {
        // Open an extra tab
        const extraPage = await context.newPage();
        await extraPage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await extraPage.waitForTimeout(300);

        // Switch back to main page and send gp
        await page.bringToFront();
        await page.waitForTimeout(300);

        const initialId = await getActiveTabId();

        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('p');
        await page.waitForTimeout(800);

        const finalId = await getActiveTabId();
        expect(finalId).toBeGreaterThan(0);
        if (DEBUG) console.log(`gp with multiple tabs: ${initialId} -> ${finalId}`);

        await extraPage.close().catch(() => {});
    });
});
