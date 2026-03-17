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

/**
 * Press Escape across all frames to ensure the omnibar receives it
 * even when the frontend iframe has focus.
 */
async function pressEscapeToCloseOmnibar(p: Page): Promise<void> {
    for (const frame of p.frames()) {
        try {
            await frame.press('body', 'Escape');
        } catch (_) {}
    }
    try { await p.keyboard.press('Escape'); } catch (_) {}
    await p.waitForTimeout(100);
}

test.describe('cmd_omnibar_history (Playwright)', () => {
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

    test('pressing oh opens history omnibar', async () => {
        await page.keyboard.press('o');
        await page.waitForTimeout(50);
        await page.keyboard.press('h');

        const opened = await waitForOmnibarState(page, true);
        expect(opened).toBe(true);
        console.log('History omnibar opened with oh key sequence');
    });

    test('history omnibar closes after pressing Escape', async () => {
        await page.keyboard.press('o');
        await page.waitForTimeout(50);
        await page.keyboard.press('h');
        await waitForOmnibarState(page, true);

        // History mode steals focus into the frontend iframe - send Escape to all frames
        await pressEscapeToCloseOmnibar(page);
        const closed = await waitForOmnibarState(page, false);
        expect(closed).toBe(true);
        console.log('History omnibar closed after Escape');
    });

    test('oh command can be used multiple times consecutively', async () => {
        // First cycle
        await page.keyboard.press('o');
        await page.waitForTimeout(50);
        await page.keyboard.press('h');
        const firstOpen = await waitForOmnibarState(page, true);
        expect(firstOpen).toBe(true);

        await pressEscapeToCloseOmnibar(page);
        await waitForOmnibarState(page, false);
        await page.waitForTimeout(300);

        // Second cycle
        await page.keyboard.press('o');
        await page.waitForTimeout(50);
        await page.keyboard.press('h');
        const secondOpen = await waitForOmnibarState(page, true);
        expect(secondOpen).toBe(true);
        console.log('History omnibar works multiple times');
        await pressEscapeToCloseOmnibar(page);
    });
});
