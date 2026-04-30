import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_nav_history_back';
const URL_A = `${FIXTURE_BASE}/scroll-test.html`;
const URL_B = `${FIXTURE_BASE}/form-test.html`;
const FIXTURE_URL = URL_A;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_nav_history_back (Playwright)', () => {
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
        // Navigate to URL_B so URL_A is the back history entry
        await page.goto(URL_B, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test('pressing S navigates back to previous URL', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const currentUrl = page.url();
            expect(currentUrl).toContain('form-test.html');

            const backPromise = page.waitForURL('**/scroll-test.html', { timeout: 10000 });
            await page.keyboard.press('S');
            await backPromise;

            const finalUrl = page.url();
            expect(finalUrl).toContain('scroll-test.html');
            if (DEBUG) console.log(`History back: ${currentUrl} → ${finalUrl}`);
        });
    });

    test('pressing S twice goes back two levels', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // We are at URL_B. Navigate to another page to add a 3rd history entry.
            await page.goto(URL_A, { waitUntil: 'load' });
            await page.waitForTimeout(500);

            // Now we are at URL_A with history: [URL_A, URL_B, URL_A(current)]
            // Press S once to go back to URL_B
            const back1 = page.waitForURL('**/form-test.html', { timeout: 10000 });
            await page.keyboard.press('S');
            await back1;
            await page.waitForTimeout(300);

            expect(page.url()).toContain('form-test.html');

            // Press S again to go back to original URL_A
            const back2 = page.waitForURL('**/scroll-test.html', { timeout: 10000 });
            await page.keyboard.press('S');
            await back2;

            expect(page.url()).toContain('scroll-test.html');
            if (DEBUG) console.log(`After two S presses: ${page.url()}`);
        });
    });
});
