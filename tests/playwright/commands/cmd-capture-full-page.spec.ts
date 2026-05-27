import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_capture_full_page';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a],
            bubbles: true,
            composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

async function waitForPopupWithImg(p: Page, timeoutMs = 25000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const frame of p.frames()) {
            if (!frame.url().includes('frontend.html')) continue;
            const visible = await frame.evaluate(() => {
                const popup = document.getElementById('sk_popup');
                if (!popup) return false;
                // showPopup("<img .../>") — DOMPurify 3.x allows img but strips data: src
                // check that popup is shown with img element present
                if (popup.style.display === 'none') return false;
                return popup.querySelector('img') !== null;
            }).catch(() => false);
            if (visible) return true;
        }
        await p.waitForTimeout(500);
    }
    return false;
}

test.describe('cmd_capture_full_page (Playwright)', () => {
    // Full-page capture scrolls the entire page with 1s waits per viewport — budget 35s
    test.setTimeout(60_000);
    test.skip(true, 'captureVisibleTab popup timing unreliable (headless Docker + local)');

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'yG', 'cmd_capture_full_page');
    });

    test('cmd_capture_full_page is invocable and initiates page capture', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.mouse.click(400, 300);
            await page.waitForTimeout(100);

            const ok = await invokeCommand(page, 'cmd_capture_full_page');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            // Wait for the popup with img to appear — full-page capture takes multiple seconds
            const appeared = await waitForPopupWithImg(page, 25000);
            if (DEBUG) console.log(`Popup appeared: ${appeared}`);
            expect(appeared).toBe(true);

            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
        });
    });
});
