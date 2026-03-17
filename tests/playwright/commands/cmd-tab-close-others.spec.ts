import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
        });
    });
}

test.describe('cmd_tab_close_others (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('gxx closes all tabs except the current one', async () => {
        // Open extra pages so we have several to close
        const extras: Page[] = [];
        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
            extras.push(p);
        }

        // Pick the middle page as the active one that should survive
        const keeper = extras[1];
        await keeper.bringToFront();
        await keeper.waitForTimeout(300);

        const activeTab = await getActiveTabViaSW(context);
        const beforeCount = context.pages().length;
        console.log(`gxx: before=${beforeCount}, keeper tab id=${activeTab.id}`);

        // Press gxx — all other tabs will close; keeper stays
        // We use a broad waitForTimeout since many tabs close at once
        await keeper.keyboard.press('g');
        await keeper.waitForTimeout(50);
        await keeper.keyboard.press('x');
        await keeper.waitForTimeout(50);
        await keeper.keyboard.press('x').catch(() => {});

        // Poll until only 1 fixture tab remains (with up to 5s)
        let finalCount = context.pages().length;
        for (let i = 0; i < 50; i++) {
            await keeper.waitForTimeout(100).catch(() => {});
            finalCount = context.pages().length;
            if (finalCount <= 1) break;
        }

        // The keeper page should still be alive, all others closed
        expect(finalCount).toBe(1);
        console.log(`gxx: ${beforeCount} → ${finalCount} pages`);
    });

    test('gxx with single tab does nothing', async () => {
        // After the previous test only 1 page remains; re-use it
        const pages = context.pages();
        // If somehow more pages exist, close extras
        for (let i = 1; i < pages.length; i++) {
            await pages[i].close().catch(() => {});
        }

        const activePage = context.pages()[0];
        if (!activePage) {
            // Recreate if needed
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(300);
        }

        await context.pages()[0].bringToFront();
        await context.pages()[0].waitForTimeout(200);

        const beforeCount = context.pages().length;

        await context.pages()[0].keyboard.press('g');
        await context.pages()[0].waitForTimeout(50);
        await context.pages()[0].keyboard.press('x');
        await context.pages()[0].waitForTimeout(50);
        await context.pages()[0].keyboard.press('x').catch(() => {});
        await context.pages()[0].waitForTimeout(800).catch(() => {});

        expect(context.pages().length).toBe(beforeCount);
        console.log(`gxx single tab: count unchanged at ${beforeCount}`);
    });
});
