import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_tab_restore (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing X restores most recently closed tab', async () => {
        // Open a page to close
        const toClose = await context.newPage();
        await toClose.goto(FIXTURE_URL, { waitUntil: 'load' });
        await toClose.waitForTimeout(500);

        // Close it via SK
        await toClose.bringToFront();
        await toClose.waitForTimeout(200);
        const closePromise = toClose.waitForEvent('close');
        await toClose.keyboard.press('x').catch(() => {});
        await closePromise;

        const countAfterClose = context.pages().length;

        // Restore via X on the main page
        const restorePromise = context.waitForEvent('page');
        await page.keyboard.press('X');
        const restoredPage = await restorePromise;

        await restoredPage.waitForLoadState('load');
        await restoredPage.waitForTimeout(300);

        expect(context.pages().length).toBeGreaterThan(countAfterClose);
        console.log(`Restored tab: ${restoredPage.url()}`);

        await restoredPage.close().catch(() => {});
    });
});
