import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_zoom_reset';
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

test.describe('cmd_tab_zoom_reset (Playwright)', () => {
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

    test('pressing zr resets zoom to default after zoom in', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // First zoom in
            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('i');
            await page.waitForTimeout(300);

            const zoomedIn = await getTabZoom();
            if (DEBUG) console.log(`After zi: ${zoomedIn}`);
            expect(zoomedIn).toBeGreaterThan(1.0);

            // Reset zoom
            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('r');
            await page.waitForTimeout(300);

            const resetZoom = await getTabZoom();
            if (DEBUG) console.log(`After zr: ${resetZoom}`);
            expect(resetZoom).toBeCloseTo(1.0, 1);
        });
    });

    test('pressing zr resets zoom to default after zoom out', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // First zoom out
            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('o');
            await page.waitForTimeout(300);

            const zoomedOut = await getTabZoom();
            if (DEBUG) console.log(`After zo: ${zoomedOut}`);
            expect(zoomedOut).toBeLessThan(1.0);

            // Reset zoom
            await page.keyboard.press('z');
            await page.waitForTimeout(50);
            await page.keyboard.press('r');
            await page.waitForTimeout(300);

            const resetZoom = await getTabZoom();
            if (DEBUG) console.log(`After zr: ${resetZoom}`);
            expect(resetZoom).toBeCloseTo(1.0, 1);
        });
    });
});
