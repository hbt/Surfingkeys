import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;

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

test.describe('cmd_nav_tab_history_forward (Playwright)', () => {
    let pages: Page[] = [];
    let ids: number[] = [];

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());

        for (let i = 0; i < 5; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
            pages.push(p);
        }

        for (const p of pages) {
            const id = await getTabIdForPage(p);
            ids.push(id);
        }
        console.log('Tab IDs:', ids);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        // Build history: ids[0] -> ids[1] -> ids[2] -> ids[3] -> ids[4] (current)
        for (let i = 0; i < 5; i++) {
            await activateTabById(ids[i]);
        }
        await pages[4].bringToFront();
        await pages[4].waitForTimeout(300);

        // Go back twice to set up forward history:
        // After: ids[2] is current, forward: [ids[3], ids[4]]
        const id4 = await getActiveTabId();
        expect(id4).toBe(ids[4]);

        // Back once: ids[4] -> ids[3]
        await pages[4].keyboard.press('B');
        await pollForTabChange(ids[4]);
        await pages[3].bringToFront();
        await pages[3].waitForTimeout(400);

        // Back again: ids[3] -> ids[2]
        await pages[3].keyboard.press('B');
        await pollForTabChange(ids[3]);
        await pages[2].bringToFront();
        await pages[2].waitForTimeout(400);

        const currentId = await getActiveTabId();
        expect(currentId).toBe(ids[2]);
    });

    test('pressing F goes forward to next tab in history', async () => {
        const initialId = await getActiveTabId();
        expect(initialId).toBe(ids[2]);

        // F should go forward to ids[3]
        await pages[2].keyboard.press('F');
        const afterId = await pollForTabChange(initialId);
        expect(afterId).toBe(ids[3]);
        console.log(`F switched from ids[2]=${initialId} to ids[3]=${afterId}`);
    });

    test('pressing F twice goes forward two steps in tab history', async () => {
        const initialId = await getActiveTabId();
        expect(initialId).toBe(ids[2]);

        // First F: ids[2] -> ids[3]
        await pages[2].keyboard.press('F');
        const afterFirst = await pollForTabChange(initialId);
        expect(afterFirst).toBe(ids[3]);

        await pages[3].bringToFront();
        await pages[3].waitForTimeout(400);

        // Second F: ids[3] -> ids[4]
        await pages[3].keyboard.press('F');
        const afterSecond = await pollForTabChange(afterFirst, 5000);
        expect(afterSecond).toBe(ids[4]);
        console.log(`Two F presses: ids[2] -> ids[3] -> ids[4]`);
    });

    test('F and B are inverses of each other', async () => {
        const initialId = await getActiveTabId();
        expect(initialId).toBe(ids[2]);

        // F: ids[2] -> ids[3]
        await pages[2].keyboard.press('F');
        const afterF = await pollForTabChange(initialId);
        expect(afterF).toBe(ids[3]);

        await pages[3].bringToFront();
        await pages[3].waitForTimeout(400);

        // B: ids[3] -> ids[2]
        await pages[3].keyboard.press('B');
        const afterB = await pollForTabChange(afterF);
        expect(afterB).toBe(ids[2]);
        expect(afterB).toBe(initialId);
        console.log(`F and B are inverses: ids[2] -> F -> ids[3] -> B -> ids[2]`);
    });
});
