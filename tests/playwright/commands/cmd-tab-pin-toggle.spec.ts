import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function getTabPinned(): Promise<boolean> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<boolean>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs[0]?.pinned ?? false);
            });
        });
    });
}

test.describe('cmd_tab_pin_toggle (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        // Ensure tab is unpinned at cleanup
        const pinned = await getTabPinned().catch(() => false);
        if (pinned) {
            await page.keyboard.press('Alt+p');
            await page.waitForTimeout(300);
        }
        await context?.close();
    });

    test.afterEach(async () => {
        // Ensure tab is unpinned after each test
        const pinned = await getTabPinned().catch(() => false);
        if (pinned) {
            await page.keyboard.press('Alt+p');
            await page.waitForTimeout(300);
        }
    });

    test('pressing Alt-p pins an unpinned tab', async () => {
        const initialPinned = await getTabPinned();
        expect(initialPinned).toBe(false);

        await page.keyboard.press('Alt+p');
        await page.waitForTimeout(300);

        const pinned = await getTabPinned();
        expect(pinned).toBe(true);
        if (DEBUG) console.log(`Tab pin toggle: ${initialPinned} → ${pinned}`);
    });

    test('pressing Alt-p twice toggles pin state back to original', async () => {
        expect(await getTabPinned()).toBe(false);

        // Pin
        await page.keyboard.press('Alt+p');
        await page.waitForTimeout(300);
        expect(await getTabPinned()).toBe(true);

        // Unpin
        await page.keyboard.press('Alt+p');
        await page.waitForTimeout(300);
        expect(await getTabPinned()).toBe(false);
        if (DEBUG) console.log(`Double Alt-p: back to unpinned`);
    });
});
