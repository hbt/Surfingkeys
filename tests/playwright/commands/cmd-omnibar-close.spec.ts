import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

/**
 * Check if the omnibar iframe is visible via shadow DOM height check.
 * When open: iframe height is NOT "0px".
 * When closed: iframe height is "0px" or the iframe is absent.
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

test.describe('cmd_omnibar_close (Playwright)', () => {
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
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
        } catch (_) {}
    });

    test('pressing Escape closes the omnibar', async () => {
        // Open omnibar with 't' (tab switcher)
        await page.keyboard.press('Shift+t');

        const opened = await waitForOmnibarState(page, true);
        expect(opened).toBe(true);
        console.log('Omnibar opened with T key');

        // Close with Escape
        await page.keyboard.press('Escape');
        const closed = await waitForOmnibarState(page, false);
        expect(closed).toBe(true);
        console.log('Omnibar closed after pressing Escape');
    });

    test('can open and close omnibar multiple times', async () => {
        // Cycle 1
        await page.keyboard.press('Shift+t');
        const open1 = await waitForOmnibarState(page, true);
        expect(open1).toBe(true);
        console.log('Cycle 1: omnibar opened');

        await page.keyboard.press('Escape');
        const closed1 = await waitForOmnibarState(page, false);
        expect(closed1).toBe(true);
        console.log('Cycle 1: omnibar closed');

        await page.waitForTimeout(300);

        // Cycle 2
        await page.keyboard.press('Shift+t');
        const open2 = await waitForOmnibarState(page, true);
        expect(open2).toBe(true);
        console.log('Cycle 2: omnibar opened');

        await page.keyboard.press('Escape');
        const closed2 = await waitForOmnibarState(page, false);
        expect(closed2).toBe(true);
        console.log('Cycle 2: omnibar closed');
    });

    test('Escape on already-closed omnibar does not cause errors', async () => {
        // Ensure omnibar is closed first
        const initialState = await isOmnibarOpen(page);
        if (initialState) {
            await page.keyboard.press('Escape');
            await waitForOmnibarState(page, false);
        }

        // Pressing Escape when already closed should be a no-op
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        const stillClosed = await isOmnibarOpen(page);
        expect(stillClosed).toBe(false);
        console.log('Escape on closed omnibar is a no-op');
    });
});
