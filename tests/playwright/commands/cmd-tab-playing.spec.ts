import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_playing';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getActiveTabId(): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                resolve(tabs[0]?.id ?? -1);
            });
        });
    });
}

async function getAudibleTabs(): Promise<Array<{ id: number; index: number }>> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<Array<{ id: number; index: number }>>((resolve) => {
            chrome.tabs.query({ audible: true, currentWindow: true }, (tabs: any[]) => {
                resolve(tabs.map((t) => ({ id: t.id, index: t.index })));
            });
        });
    });
}

test.describe('cmd_tab_playing (Playwright)', () => {
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

    test('pressing gp when no tab is audible keeps current tab active', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.bringToFront();
            await page.waitForTimeout(300);

            const initialId = await getActiveTabId();
            if (DEBUG) console.log(`Initial tab: ${initialId}`);

            // Verify no audible tabs
            const audibleTabs = await getAudibleTabs();
            if (DEBUG) console.log(`Audible tabs: ${audibleTabs.length}`);
            expect(audibleTabs.length).toBe(0);

            // Send gp
            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('p');
            await page.waitForTimeout(1000);

            // Should remain on the same tab
            const finalId = await getActiveTabId();
            if (DEBUG) console.log(`After gp with no audible tabs: ${finalId}`);
            expect(finalId).toBe(initialId);
        });
    });

    test('pressing gp executes without errors', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.bringToFront();
            await page.waitForTimeout(300);

            const initialId = await getActiveTabId();
            expect(initialId).toBeGreaterThan(0);

            // Send gp
            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('p');
            await page.waitForTimeout(800);

            // Browser should still have a valid active tab
            const afterId = await getActiveTabId();
            expect(afterId).toBeGreaterThan(0);
            if (DEBUG) console.log(`gp smoke test: ${initialId} -> ${afterId}`);
        });
    });

    test('gp with multiple tabs does not crash', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Open an extra tab
            const extraPage = await context.newPage();
            await extraPage.goto(FIXTURE_URL, { waitUntil: 'load' });
            await extraPage.waitForTimeout(300);

            // Switch back to main page and send gp
            await page.bringToFront();
            await page.waitForTimeout(300);

            const initialId = await getActiveTabId();

            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('p');
            await page.waitForTimeout(800);

            const finalId = await getActiveTabId();
            expect(finalId).toBeGreaterThan(0);
            if (DEBUG) console.log(`gp with multiple tabs: ${initialId} -> ${finalId}`);

            await extraPage.close().catch(() => {});
        });
    });
});
