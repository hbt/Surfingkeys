import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_zoom_out';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getTabZoom(): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) return resolve(1.0);
                chrome.tabs.getZoom(tabs[0].id!, (zoom) => resolve(zoom));
            });
        });
    });
}

test.describe('cmd_tab_zoom_out (Playwright)', () => {
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
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        // Reset zoom before each test
        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('r');
        await page.waitForTimeout(300);
    });

    test('pressing zo decreases zoom by 0.1', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialZoom = await getTabZoom();
            if (DEBUG) console.log(`Initial zoom: ${initialZoom}`);
            expect(initialZoom).toBeCloseTo(1.0, 1);

            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('o');
            await page.waitForTimeout(300);

            const newZoom = await getTabZoom();
            if (DEBUG) console.log(`After zo: ${newZoom}`);
            expect(newZoom).toBeCloseTo(initialZoom - 0.1, 1);
        });
    });

    test('pressing zo twice decreases zoom by 0.2', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialZoom = await getTabZoom();

            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('o');
            await page.waitForTimeout(300);

            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('o');
            await page.waitForTimeout(300);

            const newZoom = await getTabZoom();
            if (DEBUG) console.log(`After 2x zo: ${newZoom} (initial: ${initialZoom})`);
            expect(newZoom).toBeCloseTo(initialZoom - 0.2, 1);
        });
    });
});
