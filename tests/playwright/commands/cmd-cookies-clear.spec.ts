/* eslint-disable local/require-custom-command-mapping */
// Omnibar commands are invoked via the `:` command bar, not key bindings.
// The require-custom-command-mapping rule applies to key-bound commands only.
import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_cookies_clear';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function setCookieViaSW(ctx: BrowserContext, url: string, name: string, value: string): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(([u, n, v]: [string, string, string]) => {
        return new Promise<void>((resolve) => {
            chrome.cookies.set({ url: u, name: n, value: v }, () => resolve());
        });
    }, [url, name, value] as [string, string, string]);
}

async function getCookiesViaSW(ctx: BrowserContext, url: string): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((u: string) => {
        return new Promise<any[]>((resolve) => {
            chrome.cookies.getAll({ url: u }, (cookies) => resolve(cookies));
        });
    }, url);
}

async function clearCookiesViaSW(ctx: BrowserContext, url: string): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((u: string) => {
        return new Promise<void>((resolve) => {
            chrome.cookies.getAll({ url: u }, (cookies) => {
                const removes = cookies.map((c) =>
                    new Promise<void>((res) => chrome.cookies.remove({ url: u, name: c.name }, () => res()))
                );
                Promise.all(removes).then(() => resolve());
            });
        });
    }, url);
}

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

async function waitForOmnibar(p: Page, open: boolean, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if ((await isOmnibarOpen(p)) === open) return;
        await p.waitForTimeout(100);
    }
}

test.describe('cmd_cookies_clear (Playwright)', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(200);
        await clearCookiesViaSW(context, FIXTURE_URL);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('removes all cookies for current page URL', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await setCookieViaSW(context, FIXTURE_URL, 'sk_clear_a', 'value_a');
                await setCookieViaSW(context, FIXTURE_URL, 'sk_clear_b', 'value_b');

                const before = await getCookiesViaSW(context, FIXTURE_URL);
                if (DEBUG) console.log('cookies before clear:', before.length);
                expect(before.length).toBeGreaterThanOrEqual(2);

                await page.mouse.click(100, 100);
                await page.keyboard.press('Shift+Semicolon');
                await waitForOmnibar(page, true);

                await page.keyboard.type('clearCookies');
                await page.waitForTimeout(300);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(800);

                const after = await getCookiesViaSW(context, FIXTURE_URL);
                if (DEBUG) console.log('cookies after clear:', after.length);
                expect(after.length).toBe(0);
            },
        );
    });

    test('does not error when no cookies exist', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.mouse.click(100, 100);
                await page.keyboard.press('Shift+Semicolon');
                await waitForOmnibar(page, true);

                await page.keyboard.type('clearCookies');
                await page.waitForTimeout(300);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(500);

                const after = await getCookiesViaSW(context, FIXTURE_URL);
                expect(after.length).toBe(0);
            },
        );
    });
});
