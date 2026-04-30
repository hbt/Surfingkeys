import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

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

test.describe('cmd_close_tabs_by_url (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(800);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.afterEach(async () => {
        try {
            const livePage = context.pages().find(p => !p.isClosed()) ?? page;
            await livePage.keyboard.press('Escape');
            await livePage.waitForTimeout(200);
        } catch (_) {}
    });

    test('pressing ;x opens the CloseTabs omnibar', async () => {
        await page.bringToFront();
        await page.waitForTimeout(200);
        await page.keyboard.type(';x');
        const opened = await waitForOmnibarState(page, true);
        expect(opened).toBe(true);
        if (DEBUG) console.log('CloseTabs omnibar opened with ;x');
    });

    test(';x omnibar closes after pressing Escape', async () => {
        await page.bringToFront();
        await page.waitForTimeout(300);
        await page.keyboard.type(';x');
        const opened = await waitForOmnibarState(page, true);
        expect(opened).toBe(true);
        await page.keyboard.press('Escape');
        const closed = await waitForOmnibarState(page, false);
        expect(closed).toBe(true);
        if (DEBUG) console.log('CloseTabs omnibar closed after Escape');
    });

    test('pressing Enter in ;x omnibar closes all visible tabs', async () => {
        const extra1 = await context.newPage();
        await extra1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await extra1.waitForTimeout(300);

        const extra2 = await context.newPage();
        await extra2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await extra2.waitForTimeout(300);

        const beforeCount = context.pages().length;
        if (DEBUG) console.log(`Before ;x Enter: ${beforeCount} pages`);

        await extra1.bringToFront();
        await extra1.waitForTimeout(300);
        await extra1.keyboard.type(';x');
        const opened = await waitForOmnibarState(extra1, true);
        expect(opened).toBe(true);

        await extra1.waitForTimeout(500);
        // extra1 itself may close — ignore the resulting CDP error
        await extra1.keyboard.press('Enter').catch(() => {});

        // Wait without holding a Page reference (tabs are being closed)
        await new Promise(resolve => setTimeout(resolve, 2000));

        const afterCount = context.pages().length;
        if (DEBUG) console.log(`After ;x Enter: ${afterCount} pages (closed ${beforeCount - afterCount})`);
        expect(beforeCount - afterCount).toBeGreaterThanOrEqual(2);
    });
});
