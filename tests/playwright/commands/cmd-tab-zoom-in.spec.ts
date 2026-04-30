import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_zoom_in';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getTabZoom(_p: Page): Promise<number> {
    // Access zoom via chrome.tabs API from content script context is not allowed,
    // so we use the extension's service worker
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

async function resetZoom(p: Page): Promise<void> {
    // Press zr to reset zoom
    await p.keyboard.press('z');
    await p.waitForTimeout(50);
    await p.keyboard.press('r');
    await p.waitForTimeout(300);
}

test.describe('cmd_tab_zoom_in (Playwright)', () => {
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
        await resetZoom(page);
    });

    test('pressing zi increases zoom by 0.1', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialZoom = await getTabZoom(page);
            if (DEBUG) console.log(`Initial zoom: ${initialZoom}`);
            expect(initialZoom).toBeCloseTo(1.0, 1);

            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('i');
            await page.waitForTimeout(300);

            const newZoom = await getTabZoom(page);
            if (DEBUG) console.log(`After zi: ${newZoom}`);
            expect(newZoom).toBeCloseTo(initialZoom + 0.1, 1);
        });
    });

    test('pressing zi twice increases zoom by 0.2', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialZoom = await getTabZoom(page);

            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('i');
            await page.waitForTimeout(300);

            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('i');
            await page.waitForTimeout(300);

            const newZoom = await getTabZoom(page);
            if (DEBUG) console.log(`After 2x zi: ${newZoom} (initial: ${initialZoom})`);
            expect(newZoom).toBeCloseTo(initialZoom + 0.2, 1);
        });
    });
});
