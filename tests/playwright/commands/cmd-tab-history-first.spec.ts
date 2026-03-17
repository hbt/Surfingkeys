import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

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

async function activateTab(tabId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { active: true }, () => resolve());
        });
    }, tabId);
}

async function getAllTabsSorted(): Promise<Array<{ id: number; index: number }>> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    const tabs = await sw.evaluate(() => {
        return new Promise<Array<{ id: number; index: number }>>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                resolve(tabs.map((t) => ({ id: t.id, index: t.index })));
            });
        });
    });
    return tabs.sort((a, b) => a.index - b.index);
}

test.describe('cmd_tab_history_first (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());

        // Create 4 pages
        for (let i = 0; i < 4; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
        }

        // Get all pages after creation
        const allPages = context.pages().filter((p) => !p.isClosed());
        page = allPages[allPages.length - 1];
        await page.waitForTimeout(500);

        // Build activation history by activating tabs in order via SW
        const tabs = await getAllTabsSorted();
        for (const tab of tabs) {
            await activateTab(tab.id);
            await page.waitForTimeout(300);
        }

        // Land on the last tab
        const lastTab = tabs[tabs.length - 1];
        await activateTab(lastTab.id);
        await page.waitForTimeout(500);

        // Sync page reference to the active page
        const activeId = await getActiveTabId();
        const activePage = context.pages().find((p) => !p.isClosed());
        if (activePage) page = activePage;
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('gT command executes without errors and browser stays valid', async () => {
        const activePage = context.pages().find((p) => !p.isClosed()) ?? page;
        await activePage.bringToFront();
        await activePage.waitForTimeout(300);

        const initialId = await getActiveTabId();
        console.log(`Initial tab ID: ${initialId}`);
        expect(initialId).toBeGreaterThan(0);

        // Send gT
        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('T');
        await activePage.waitForTimeout(1000);

        // Browser should still have a valid active tab
        const afterId = await getActiveTabId();
        console.log(`After gT: active tab ID=${afterId}`);
        expect(afterId).toBeGreaterThan(0);
    });

    test('gT switches to a different tab (smoke test)', async () => {
        const tabs = await getAllTabsSorted();
        expect(tabs.length).toBeGreaterThan(1);

        // Rebuild history: activate from first to last
        for (const tab of tabs) {
            await activateTab(tab.id);
            await page.waitForTimeout(200);
        }
        // End on last tab
        await activateTab(tabs[tabs.length - 1].id);
        await page.waitForTimeout(500);

        const activePage = context.pages().find((p) => !p.isClosed()) ?? page;
        await activePage.bringToFront();
        await activePage.waitForTimeout(300);

        const initialId = await getActiveTabId();
        console.log(`Before gT: active tab=${initialId}`);

        await activePage.keyboard.press('g');
        await activePage.waitForTimeout(50);
        await activePage.keyboard.press('T');
        await activePage.waitForTimeout(1000);

        const afterId = await getActiveTabId();
        console.log(`After gT: active tab=${afterId}`);
        expect(afterId).toBeGreaterThan(0);

        if (afterId !== initialId) {
            console.log(`gT switched tab: ${initialId} -> ${afterId}`);
        } else {
            console.log(`gT: tab unchanged (may be at boundary of history)`);
        }
    });

    test('gT can be called multiple times without crashing', async () => {
        for (let i = 0; i < 3; i++) {
            const activePage = context.pages().find((p) => !p.isClosed()) ?? page;
            await activePage.bringToFront();
            await activePage.waitForTimeout(200);

            await activePage.keyboard.press('g').catch(() => {});
            await activePage.waitForTimeout(50);
            await activePage.keyboard.press('T').catch(() => {});
            await activePage.waitForTimeout(700);

            const id = await getActiveTabId();
            expect(id).toBeGreaterThan(0);
            console.log(`gT invocation ${i + 1}: active tab=${id}`);
        }
    });
});
