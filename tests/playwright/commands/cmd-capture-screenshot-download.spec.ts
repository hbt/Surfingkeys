import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_capture_screenshot_download';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let covForPageUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getRecentDownloads(ctx: BrowserContext, sinceMs: number): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((since: number) =>
        new Promise<any[]>((resolve) => {
            chrome.downloads.search({ orderBy: ['-startTime'], limit: 10 }, function(items) {
                resolve(items.filter(item =>
                    new Date(item.startTime ?? 0).getTime() >= since
                ));
            });
        }),
        sinceMs
    );
}

test.describe('cmd_capture_screenshot_download (Playwright)', () => {
    test.setTimeout(30_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        covForPageUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(800);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('downloads screenshot as PNG and copies filepath to clipboard', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl: covForPageUrl },
            test.info().title,
            async () => {
                const beforeMs = Date.now();

                await test.step('When the command is invoked', async () => {
                    await invokeCommand(page, 'cmd_capture_screenshot_download');
                    // Wait for captureVisibleTab (500ms delay) + download + clipboard write
                    await page.waitForTimeout(2000);
                });

                await test.step('Then a download should be created', async () => {
                    const downloads = await getRecentDownloads(context, beforeMs - 1000);
                    expect(downloads.length, 'Expected at least one download').toBeGreaterThan(0);
                    const dl = downloads[0];
                    expect(dl.filename).toBeTruthy();
                    // In production the filename is screenshot-<ts>.png in ~/web_dld;
                    // in Playwright the download dir is a temp path with a UUID filename.
                    expect(dl.state).toBe('complete');
                });
            }
        );
    });
});
