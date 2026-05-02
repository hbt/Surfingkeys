import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, setSkConf, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
// page = primary test page (will have digitForRepeat disabled in test 2)
let page: Page;
// page2 = fresh page with default settings (never had overrides)
let page2: Page;
let covBg: ServiceWorkerCoverage | undefined;

test.describe('cmd_digit_repeat (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;

        // Set up page (primary)
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        // Set up page2 (fresh default) — created in beforeAll before any test modifies state
        page2 = await context.newPage();
        await page2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page2.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('3yt with repeat creates 3 duplicate tabs', async () => {
        await page.bringToFront();
        const beforeCount = context.pages().length;

        await page.keyboard.press('3');
        await page.waitForTimeout(50);
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('t');
        await page.waitForTimeout(1500);

        expect(context.pages().length).toBe(beforeCount + 3);

        // cleanup extra tabs
        const extraPages = context.pages().slice(beforeCount);
        await Promise.all(extraPages.map(p => p.close().catch(() => {})));
        await page.bringToFront();
        await page.waitForTimeout(300);
    });

    test('domain-specific digitForRepeat=false passes digits to page and duplicates only once; another page with default setting duplicates 3x', async () => {
        // Part A — page with repeat disabled (simulates the domain config)
        await page.bringToFront();

        // Inject keydown listener in main world to detect what SK suppresses
        await page.evaluate(() => {
            (window as any).__capturedKeys = [];
            document.addEventListener('keydown', (e: KeyboardEvent) => {
                (window as any).__capturedKeys.push(e.key);
            }, true);
        });

        // Simulate domain config: disable digit-repeat for this page's content script
        const ok = await setSkConf(page, 'digitForRepeat', false);
        expect(ok).toBe(true);

        // Send 3yt — with digitForRepeat=false, '3' is not consumed as repeat
        const beforeCount = context.pages().length;
        await page.keyboard.press('3');
        await page.waitForTimeout(50);
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('t');
        await page.waitForTimeout(1000);

        // Assert: only 1 duplicate (RUNTIME.repeats was never set; defaults to 1)
        expect(context.pages().length).toBe(beforeCount + 1);

        // Assert: '3' reached the page (sk_stopPropagation was NOT set)
        const capturedKeys = await page.evaluate(() => (window as any).__capturedKeys);
        expect(capturedKeys).toContain('3');

        // cleanup extra tab
        const pages = context.pages();
        await pages[pages.length - 1]?.close();
        await page.bringToFront();
        await page.waitForTimeout(300);

        // Part B — page2 with default settings (represents "another domain")
        // page2 was created in beforeAll with fresh defaults — digitForRepeat=true
        // The setSkConf override from page does NOT carry over (each page has isolated content script)
        await page2.bringToFront();
        await page2.waitForTimeout(500);

        // Capture keys to diagnose SK behavior on page2
        await page2.evaluate(() => {
            (window as any).__p2Keys = [];
            document.addEventListener('keydown', (e: KeyboardEvent) => {
                (window as any).__p2Keys.push(e.key);
            }, true);
        });

        const beforeCount2 = context.pages().length;
        await page2.keyboard.press('3');
        await page2.waitForTimeout(50);
        await page2.keyboard.press('y');
        await page2.waitForTimeout(50);
        await page2.keyboard.press('t');
        await page2.waitForTimeout(1500);

        const p2Keys = await page2.evaluate(() => (window as any).__p2Keys);
        if (DEBUG) console.log(`[diag] page2 capturedKeys: ${JSON.stringify(p2Keys)}, new tabs: ${context.pages().length - beforeCount2}`);

        // 3 tabs should now open (repeat works normally on page2)
        expect(context.pages().length).toBe(beforeCount2 + 3);

        // cleanup
        const extraPages = context.pages().slice(beforeCount2);
        await Promise.all(extraPages.map(p => p.close().catch(() => {})));
    });
});
