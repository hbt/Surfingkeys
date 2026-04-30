import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function getTabCount(): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs.length));
        });
    });
}

async function closeExtraTabs(keepTabId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate((keepId: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                const toClose = tabs.filter((t: any) => t.id !== keepId).map((t: any) => t.id);
                if (toClose.length === 0) { resolve(); return; }
                chrome.tabs.remove(toClose, () => resolve());
            });
        });
    }, keepTabId);
}

test.describe('cmd_nav_open_clipboard (Playwright)', () => {
    let fixtureTabId: number;

    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        // Grant clipboard permissions before launching the page
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);

        const sw = context.serviceWorkers()[0];
        fixtureTabId = await sw.evaluate(() => {
            return new Promise<number>((resolve) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                    resolve(tabs[0]?.id ?? -1);
                });
            });
        });
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_nav_open_clipboard');
        await cov?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        // Close any extra tabs created during test
        await closeExtraTabs(fixtureTabId);
        await page.waitForTimeout(200);
    });

    test('pressing cc with selected URL text opens a new tab', async () => {
        const initialTabCount = await getTabCount();
        const selectedUrl = `${FIXTURE_BASE}/scroll-test.html`;

        // Create a div with URL text and select it
        await page.evaluate((url: string) => {
            const div = document.createElement('div');
            div.id = 'test-url-div';
            div.textContent = url;
            document.body.appendChild(div);

            const range = document.createRange();
            range.selectNodeContents(div);
            const sel = window.getSelection()!;
            sel.removeAllRanges();
            sel.addRange(range);
        }, selectedUrl);

        const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
        expect(selectedText).toContain('scroll-test.html');

        await page.keyboard.press('c');
        await page.waitForTimeout(50);
        await page.keyboard.press('c');

        // Poll for a new tab to appear
        let newTabCount = initialTabCount;
        for (let i = 0; i < 30; i++) {
            await page.waitForTimeout(200);
            newTabCount = await getTabCount();
            if (newTabCount > initialTabCount) break;
        }

        expect(newTabCount).toBeGreaterThan(initialTabCount);
        if (DEBUG) console.log(`cc created new tab: ${initialTabCount} → ${newTabCount} tabs`);

        // Cleanup test div
        await page.evaluate(() => {
            document.getElementById('test-url-div')?.remove();
            window.getSelection()?.removeAllRanges();
        });
    });

    test('cc command opens clipboard URL in new tab', async () => {
        // Write a URL to clipboard and open it via cc (no selection needed)
        const clipboardUrl = `${FIXTURE_BASE}/form-test.html`;
        await page.evaluate((url: string) => navigator.clipboard.writeText(url), clipboardUrl);
        await page.waitForTimeout(200);

        // Clear any selection first
        await page.evaluate(() => window.getSelection()?.removeAllRanges());

        const initialTabCount = await getTabCount();

        await page.keyboard.press('c');
        await page.waitForTimeout(50);
        await page.keyboard.press('c');

        // Poll for new tab
        let newTabCount = initialTabCount;
        for (let i = 0; i < 30; i++) {
            await page.waitForTimeout(200);
            newTabCount = await getTabCount();
            if (newTabCount > initialTabCount) break;
        }

        expect(newTabCount).toBeGreaterThan(initialTabCount);
        if (DEBUG) console.log(`cc opened clipboard URL: tab count ${initialTabCount} → ${newTabCount}`);
    });
});
