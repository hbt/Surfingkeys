import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_pin_toggle';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getTabPinned(): Promise<boolean> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<boolean>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs[0]?.pinned ?? false);
            });
        });
    });
}

test.describe('cmd_tab_pin_toggle (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        // Ensure tab is unpinned at cleanup
        const pinned = await getTabPinned().catch(() => false);
        if (pinned) {
            await page.keyboard.press('Alt+p');
            await page.waitForTimeout(300);
        }
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        // Ensure tab is unpinned after each test
        const pinned = await getTabPinned().catch(() => false);
        if (pinned) {
            await page.keyboard.press('Alt+p');
            await page.waitForTimeout(300);
        }
    });

    test('pressing Alt-p pins an unpinned tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialPinned = await getTabPinned();
            expect(initialPinned).toBe(false);

            await page.keyboard.press('Alt+p');
            await page.waitForTimeout(300);

            const pinned = await getTabPinned();
            expect(pinned).toBe(true);
            if (DEBUG) console.log(`Tab pin toggle: ${initialPinned} → ${pinned}`);
        });
    });

    test('pressing Alt-p twice toggles pin state back to original', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            expect(await getTabPinned()).toBe(false);

            // Pin
            await page.keyboard.press('Alt+p');
            await page.waitForTimeout(300);
            expect(await getTabPinned()).toBe(true);

            // Unpin
            await page.keyboard.press('Alt+p');
            await page.waitForTimeout(300);
            expect(await getTabPinned()).toBe(false);
            if (DEBUG) console.log(`Double Alt-p: back to unpinned`);
        });
    });
});
