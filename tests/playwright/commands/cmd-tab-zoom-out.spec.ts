import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function getTabZoom(): Promise<number> {
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

test.describe('cmd_tab_zoom_out (Playwright)', () => {
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
        // Reset zoom before each test
        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('r');
        await page.waitForTimeout(300);
    });

    test('pressing zo decreases zoom by 0.1', async () => {
        const initialZoom = await getTabZoom();
        if (DEBUG) console.log(`Initial zoom: ${initialZoom}`);
        expect(initialZoom).toBeCloseTo(1.0, 1);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('o');
        await page.waitForTimeout(300);

        const newZoom = await getTabZoom();
        if (DEBUG) console.log(`After zo: ${newZoom}`);
        expect(newZoom).toBeCloseTo(initialZoom - 0.1, 1);
    });

    test('pressing zo twice decreases zoom by 0.2', async () => {
        const initialZoom = await getTabZoom();

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('o');
        await page.waitForTimeout(300);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('o');
        await page.waitForTimeout(300);

        const newZoom = await getTabZoom();
        if (DEBUG) console.log(`After 2x zo: ${newZoom} (initial: ${initialZoom})`);
        expect(newZoom).toBeCloseTo(initialZoom - 0.2, 1);
    });
});
