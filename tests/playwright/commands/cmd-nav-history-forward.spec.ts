import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const URL_A = `${FIXTURE_BASE}/scroll-test.html`;
const URL_B = `${FIXTURE_BASE}/form-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_nav_history_forward (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(URL_A, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        // Build history: URL_A → URL_B, then go back to URL_A
        // so URL_B is available as forward history
        await page.goto(URL_A, { waitUntil: 'load' });
        await page.waitForTimeout(300);
        await page.goto(URL_B, { waitUntil: 'load' });
        await page.waitForTimeout(300);
        // Go back to URL_A (using browser back)
        await page.goBack({ waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test('pressing D navigates forward to next URL in history', async () => {
        const currentUrl = page.url();
        expect(currentUrl).toContain('scroll-test.html');

        const forwardPromise = page.waitForURL('**/form-test.html', { timeout: 10000 });
        await page.keyboard.press('D');
        await forwardPromise;

        const finalUrl = page.url();
        expect(finalUrl).toContain('form-test.html');
        if (DEBUG) console.log(`History forward: ${currentUrl} → ${finalUrl}`);
    });

    test('pressing D and S toggles between history entries', async () => {
        expect(page.url()).toContain('scroll-test.html');

        // Forward
        const fwd = page.waitForURL('**/form-test.html', { timeout: 10000 });
        await page.keyboard.press('D');
        await fwd;
        expect(page.url()).toContain('form-test.html');

        // Back again
        const bk = page.waitForURL('**/scroll-test.html', { timeout: 10000 });
        await page.keyboard.press('S');
        await bk;
        expect(page.url()).toContain('scroll-test.html');

        if (DEBUG) console.log(`Toggle D/S: back to ${page.url()}`);
    });
});
