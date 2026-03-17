import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

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

test.describe('cmd_omnibar_tab_urls (Playwright)', () => {
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

    test('pressing T opens tab URLs omnibar', async () => {
        // T = Shift+t
        await page.keyboard.press('Shift+t');

        const opened = await waitForOmnibarState(page, true);
        expect(opened).toBe(true);
        console.log('Tab URLs omnibar opened with T key');
    });

    test('tab URLs omnibar closes after pressing Escape', async () => {
        await page.keyboard.press('Shift+t');
        await waitForOmnibarState(page, true);

        await page.keyboard.press('Escape');
        const closed = await waitForOmnibarState(page, false);
        expect(closed).toBe(true);
        console.log('Tab URLs omnibar closed after Escape');
    });

    test('T command can be used multiple times consecutively', async () => {
        // First cycle
        await page.keyboard.press('Shift+t');
        const firstOpen = await waitForOmnibarState(page, true);
        expect(firstOpen).toBe(true);

        await page.keyboard.press('Escape');
        await waitForOmnibarState(page, false);
        await page.waitForTimeout(300);

        // Second cycle
        await page.keyboard.press('Shift+t');
        const secondOpen = await waitForOmnibarState(page, true);
        expect(secondOpen).toBe(true);
        console.log('Tab URLs omnibar works multiple times');
    });
});
