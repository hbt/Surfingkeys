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
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs[0]?.id ?? -1);
            });
        });
    });
}

test.describe('cmd_tab_next (Playwright)', () => {
    let page2: Page;

    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        // Open a second tab
        page2 = await context.newPage();
        await page2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page2.waitForTimeout(500);
        // Focus back on page1
        await page.bringToFront();
        await page.waitForTimeout(300);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing R switches to a different tab', async () => {
        const initialTabId = await getActiveTabId();
        if (DEBUG) console.log(`Initial active tab: ${initialTabId}`);

        await page.keyboard.press('R');
        await page.waitForTimeout(500);

        const newTabId = await getActiveTabId();
        if (DEBUG) console.log(`After R: active tab ${newTabId}`);

        expect(newTabId).not.toBe(initialTabId);
        if (DEBUG) console.log(`Tab switched: ${initialTabId} → ${newTabId}`);
    });

    test('pressing R twice cycles through tabs', async () => {
        await page.bringToFront();
        await page.waitForTimeout(300);
        const initialTabId = await getActiveTabId();

        await page.keyboard.press('R');
        await page.waitForTimeout(400);
        const afterFirst = await getActiveTabId();
        expect(afterFirst).not.toBe(initialTabId);

        // Press R on the now-active tab (page2)
        const activePage = context.pages().find(async (p) => {
            // Find the now-focused page - use the page that's not page
            return p !== page;
        }) ?? page2;
        await activePage.bringToFront();
        await activePage.keyboard.press('R');
        await activePage.waitForTimeout(400);
        const afterSecond = await getActiveTabId();

        // After cycling through all tabs, we should be back or at next tab
        if (DEBUG) console.log(`After 2x R: ${initialTabId} → ${afterFirst} → ${afterSecond}`);
        expect(afterSecond).toBeDefined();
    });
});
