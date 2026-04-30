import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_nav_reload (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing r reloads the page (clears injected window variable)', async () => {
        // Inject a unique marker
        const marker = Date.now();
        await page.evaluate((m) => { (window as any).__reloadTestMarker = m; }, marker);
        const markerCheck = await page.evaluate(() => (window as any).__reloadTestMarker);
        expect(markerCheck).toBe(marker);

        // Wait for load BEFORE pressing key
        const loadPromise = page.waitForLoadState('load');
        await page.keyboard.press('r');
        await loadPromise;
        await page.waitForTimeout(500); // SK re-injection settle

        // Marker should be gone after reload
        const markerAfter = await page.evaluate(() => (window as any).__reloadTestMarker);
        expect(markerAfter).toBeUndefined();
        if (DEBUG) console.log(`Marker after reload: ${markerAfter} (expected: undefined)`);
    });

    test('page content is preserved after reload', async () => {
        const titleBefore = await page.evaluate(() => document.title);
        expect(titleBefore).toBeTruthy();

        const loadPromise = page.waitForLoadState('load');
        await page.keyboard.press('r');
        await loadPromise;
        await page.waitForTimeout(500);

        const titleAfter = await page.evaluate(() => document.title);
        expect(titleAfter).toBe(titleBefore);
        if (DEBUG) console.log(`Title preserved after reload: ${titleAfter}`);
    });
});
