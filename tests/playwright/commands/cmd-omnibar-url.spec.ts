import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

/**
 * Check if the omnibar iframe is visible via shadow DOM height check.
 * The SK frontend renders inside an iframe inside a shadow root div.
 * When the omnibar is open the iframe height is NOT "0px".
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

/**
 * Press Escape in a way that reaches the omnibar.
 * For omnibar modes that steal focus into the frontend iframe (e.g. go, oh),
 * we try sending Escape to that iframe frame first, then fall back to the page.
 */
async function pressEscapeToCloseOmnibar(p: Page): Promise<void> {
    // Try all frames - the frontend iframe may hold focus
    for (const frame of p.frames()) {
        try {
            await frame.press('body', 'Escape');
        } catch (_) {}
    }
    // Also send to main page for good measure
    try { await p.keyboard.press('Escape'); } catch (_) {}
    await p.waitForTimeout(100);
}

test.describe('cmd_omnibar_url (Playwright)', () => {
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
            await pressEscapeToCloseOmnibar(page);
            await page.waitForTimeout(200);
        } catch (_) {}
    });

    test('pressing go opens URL omnibar', async () => {
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('o');

        const opened = await waitForOmnibarState(page, true);
        expect(opened).toBe(true);
        if (DEBUG) console.log('Omnibar opened with go key sequence');
    });

    test('omnibar closes after pressing Escape', async () => {
        // Open
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('o');
        await waitForOmnibarState(page, true);

        // Close - send Escape to all frames since URL mode steals focus to iframe
        await pressEscapeToCloseOmnibar(page);
        const closed = await waitForOmnibarState(page, false);
        expect(closed).toBe(true);
        if (DEBUG) console.log('Omnibar closed after Escape');
    });

    test('go command can be used multiple times consecutively', async () => {
        // First cycle
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('o');
        const firstOpen = await waitForOmnibarState(page, true);
        expect(firstOpen).toBe(true);

        await pressEscapeToCloseOmnibar(page);
        await waitForOmnibarState(page, false);
        await page.waitForTimeout(300);

        // Second cycle
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('o');
        const secondOpen = await waitForOmnibarState(page, true);
        expect(secondOpen).toBe(true);
        if (DEBUG) console.log('go command works multiple times consecutively');
    });
});
