import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

/**
 * Check if the omnibar iframe is visible via shadow DOM height check.
 */
async function isOmnibarOpen(p: Page): Promise<boolean> {
    return p.evaluate(() => {
        const divs = document.querySelectorAll('div');
        for (const div of Array.from(divs)) {
            if (div.shadowRoot) {
                const iframe = div.shadowRoot.querySelector('iframe.sk_ui');
                if (iframe) {
                    const h = (iframe as HTMLElement).style.height;
                    return h !== '0px' && h !== '';
                }
            }
        }
        return false;
    });
}

async function waitForOmnibarState(p: Page, expected: boolean, timeoutMs = 5000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const open = await isOmnibarOpen(p);
        if (open === expected) return true;
        await p.waitForTimeout(100);
    }
    return false;
}

test.describe('cmd_omnibar_bookmarks (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(800);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_omnibar_bookmarks');
        await cov?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
        } catch (_) {}
    });

    test('pressing b opens bookmarks omnibar', async () => {
        await page.keyboard.press('b');

        const opened = await waitForOmnibarState(page, true);
        expect(opened).toBe(true);
        if (DEBUG) console.log('Bookmarks omnibar opened with b key');
    });

    test('omnibar closes after pressing Escape', async () => {
        await page.keyboard.press('b');
        await waitForOmnibarState(page, true);

        await page.keyboard.press('Escape');
        const closed = await waitForOmnibarState(page, false);
        expect(closed).toBe(true);
        if (DEBUG) console.log('Bookmarks omnibar closed after Escape');
    });

    test('can open bookmarks omnibar multiple times', async () => {
        // First cycle
        await page.keyboard.press('b');
        const firstOpen = await waitForOmnibarState(page, true);
        expect(firstOpen).toBe(true);

        await page.keyboard.press('Escape');
        await waitForOmnibarState(page, false);
        await page.waitForTimeout(300);

        // Second cycle
        await page.keyboard.press('b');
        const secondOpen = await waitForOmnibarState(page, true);
        expect(secondOpen).toBe(true);
        if (DEBUG) console.log('Bookmarks omnibar works multiple times');
    });
});
