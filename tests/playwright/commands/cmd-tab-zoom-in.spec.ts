import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function getTabZoom(p: Page): Promise<number> {
    // Access zoom via chrome.tabs API from content script context is not allowed,
    // so we use the extension's service worker
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) return resolve(1.0);
                chrome.tabs.getZoom(tabs[0].id!, (zoom) => resolve(zoom));
            });
        });
    });
}

async function resetZoom(p: Page): Promise<void> {
    // Press zr to reset zoom
    await p.keyboard.press('z');
    await p.waitForTimeout(50);
    await p.keyboard.press('r');
    await p.waitForTimeout(300);
}

test.describe('cmd_tab_zoom_in (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        await resetZoom(page);
    });

    test('pressing zi increases zoom by 0.1', async () => {
        const initialZoom = await getTabZoom(page);
        if (DEBUG) console.log(`Initial zoom: ${initialZoom}`);
        expect(initialZoom).toBeCloseTo(1.0, 1);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('i');
        await page.waitForTimeout(300);

        const newZoom = await getTabZoom(page);
        if (DEBUG) console.log(`After zi: ${newZoom}`);
        expect(newZoom).toBeCloseTo(initialZoom + 0.1, 1);
    });

    test('pressing zi twice increases zoom by 0.2', async () => {
        const initialZoom = await getTabZoom(page);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('i');
        await page.waitForTimeout(300);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('i');
        await page.waitForTimeout(300);

        const newZoom = await getTabZoom(page);
        if (DEBUG) console.log(`After 2x zi: ${newZoom} (initial: ${initialZoom})`);
        expect(newZoom).toBeCloseTo(initialZoom + 0.2, 1);
    });
});
