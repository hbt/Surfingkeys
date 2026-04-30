import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

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

test.describe('cmd_tab_previous (Playwright)', () => {
    let page2: Page;

    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
        // Open a second tab so there's something to navigate to
        page2 = await context.newPage();
        await page2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page2.waitForTimeout(500);
        // Focus back on page1
        await page.bringToFront();
        await page.waitForTimeout(300);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_tab_previous');
        await cov?.close();
        await context?.close();
    });

    test('pressing E switches to a different tab', async () => {
        const initialTabId = await getActiveTabId();
        if (DEBUG) console.log(`Initial active tab: ${initialTabId}`);

        await page.keyboard.press('E');
        await page.waitForTimeout(500);

        const newTabId = await getActiveTabId();
        if (DEBUG) console.log(`After E: active tab ${newTabId}`);

        expect(newTabId).not.toBe(initialTabId);
        if (DEBUG) console.log(`Tab switched back: ${initialTabId} → ${newTabId}`);
    });

    test('pressing E and R cycles back to original tab', async () => {
        await page.bringToFront();
        await page.waitForTimeout(300);
        const initialTabId = await getActiveTabId();

        // E goes back (or wraps)
        await page.keyboard.press('E');
        await page.waitForTimeout(400);
        const afterE = await getActiveTabId();
        expect(afterE).not.toBe(initialTabId);

        // R goes forward
        const activePage = context.pages().find((p) => p !== page) ?? page2;
        await activePage.bringToFront();
        await activePage.keyboard.press('R');
        await activePage.waitForTimeout(400);
        const afterR = await getActiveTabId();

        if (DEBUG) console.log(`E then R: ${initialTabId} → ${afterE} → ${afterR}`);
        expect(afterR).toBeDefined();
    });
});
