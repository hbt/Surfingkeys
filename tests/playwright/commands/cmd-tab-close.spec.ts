import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_tab_close (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing x closes the current tab', async () => {
        // Open a second page to close (we keep the main page alive)
        const pageToClose = await context.newPage();
        await pageToClose.goto(FIXTURE_URL, { waitUntil: 'load' });
        await pageToClose.waitForTimeout(500);

        await pageToClose.bringToFront();
        await pageToClose.waitForTimeout(200);
        const beforeCount = context.pages().length;

        const closePromise = pageToClose.waitForEvent('close');
        // Tab closes so fast that CDP response is lost — ignore the keyboard error
        await pageToClose.keyboard.press('x').catch(() => {});
        await closePromise;

        expect(context.pages().length).toBe(beforeCount - 1);
        console.log(`Tab closed: ${beforeCount} → ${context.pages().length} pages`);
    });

    test('pressing x twice closes two tabs', async () => {
        // Open two extra pages to close
        const p1 = await context.newPage();
        await p1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await p1.waitForTimeout(300);

        const p2 = await context.newPage();
        await p2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await p2.waitForTimeout(300);

        const beforeCount = context.pages().length;

        await p1.bringToFront();
        await p1.waitForTimeout(200);
        const close1 = p1.waitForEvent('close');
        await p1.keyboard.press('x').catch(() => {});
        await close1;

        await p2.bringToFront();
        await p2.waitForTimeout(200);
        const close2 = p2.waitForEvent('close');
        await p2.keyboard.press('x').catch(() => {});
        await close2;

        expect(context.pages().length).toBe(beforeCount - 2);
        console.log(`Two tabs closed: ${beforeCount} → ${context.pages().length} pages`);
    });
});
