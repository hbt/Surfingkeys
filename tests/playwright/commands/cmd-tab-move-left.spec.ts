import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function getTabById(tabId: number): Promise<{ id: number; index: number } | null> {
    const sw = context.serviceWorkers()[0];
    if (!sw) return null;
    return sw.evaluate((id: number) => {
        return new Promise<{ id: number; index: number } | null>((resolve) => {
            chrome.tabs.get(id, (tab: any) => {
                if (chrome.runtime.lastError || !tab) {
                    resolve(null);
                } else {
                    resolve({ id: tab.id, index: tab.index });
                }
            });
        });
    }, tabId);
}

async function getActiveTabInfo(): Promise<{ id: number; index: number }> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<{ id: number; index: number }>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                resolve({ id: tabs[0].id, index: tabs[0].index });
            });
        });
    });
}

test.describe('cmd_tab_move_left (Playwright)', () => {
    let pages: Page[] = [];

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        // Create 4 pages so we have room to move left
        for (let i = 0; i < 4; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(300);
            pages.push(p);
        }
        // Focus the last page (rightmost) so we can move left
        page = pages[pages.length - 1];
        await page.bringToFront();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing << moves tab one position to the left', async () => {
        await page.bringToFront();
        await page.waitForTimeout(300);

        const initialInfo = await getActiveTabInfo();
        const initialIndex = initialInfo.index;
        const initialId = initialInfo.id;
        console.log(`Initial tab: id=${initialId}, index=${initialIndex}`);

        // Must not be at leftmost position
        expect(initialIndex).toBeGreaterThan(0);

        // Press << to move tab left (< is Shift+Comma)
        await page.keyboard.press('Shift+Comma');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+Comma');
        await page.waitForTimeout(500);

        // Poll for position change
        let movedTab: { id: number; index: number } | null = null;
        for (let i = 0; i < 20; i++) {
            const current = await getTabById(initialId);
            if (current && current.index < initialIndex) {
                movedTab = current;
                break;
            }
            await page.waitForTimeout(100);
        }

        expect(movedTab).not.toBeNull();
        expect(movedTab!.index).toBe(initialIndex - 1);
        expect(movedTab!.id).toBe(initialId);
        console.log(`After <<: moved from index ${initialIndex} to ${movedTab!.index}`);
    });

    test('pressing << twice moves tab two positions to the left', async () => {
        await page.bringToFront();
        await page.waitForTimeout(300);

        const initialInfo = await getActiveTabInfo();
        const initialIndex = initialInfo.index;
        const initialId = initialInfo.id;

        expect(initialIndex).toBeGreaterThanOrEqual(2);

        // First <<
        await page.keyboard.press('Shift+Comma');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+Comma');
        await page.waitForTimeout(500);

        let afterFirst: { id: number; index: number } | null = null;
        for (let i = 0; i < 20; i++) {
            const current = await getTabById(initialId);
            if (current && current.index < initialIndex) {
                afterFirst = current;
                break;
            }
            await page.waitForTimeout(100);
        }
        expect(afterFirst).not.toBeNull();
        expect(afterFirst!.index).toBe(initialIndex - 1);

        // Second <<
        await page.keyboard.press('Shift+Comma');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+Comma');
        await page.waitForTimeout(500);

        let afterSecond: { id: number; index: number } | null = null;
        for (let i = 0; i < 20; i++) {
            const current = await getTabById(initialId);
            if (current && current.index < afterFirst!.index) {
                afterSecond = current;
                break;
            }
            await page.waitForTimeout(100);
        }
        expect(afterSecond).not.toBeNull();
        expect(afterSecond!.index).toBe(initialIndex - 2);
        expect(afterSecond!.id).toBe(initialId);
        console.log(`After 2x <<: moved from index ${initialIndex} to ${afterSecond!.index}`);
    });
});
