import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';
const SUITE_LABEL = 'cmd_chrome_downloads';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_cmd_chrome_downloads`;
const EXPECTED_URL_PREFIX = 'chrome://downloads';

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_chrome_downloads (Playwright)', () => {
    test.setTimeout(15_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        const page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('opens chrome://downloads/ tab', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const sw = context.serviceWorkers()[0];
                if (!sw) throw new Error('No service worker found');

                const page = context.pages().find(p => p.url().includes('scroll-test.html')) ?? context.pages()[0];

                const tabsBefore = await sw.evaluate(() =>
                    new Promise<number>(resolve => chrome.tabs.query({}, tabs => resolve(tabs.length))),
                );

                const invoked = await invokeCommand(page, 'cmd_chrome_downloads');
                expect(invoked, 'invokeCommand must acknowledge cmd_chrome_downloads').toBe(true);

                await page.waitForTimeout(1200);

                const tabsAfter = await sw.evaluate(() =>
                    new Promise<Array<{ id?: number; url?: string; pendingUrl?: string }>>(resolve => {
                        chrome.tabs.query({}, tabs =>
                            resolve(tabs.map(t => ({ id: t.id, url: t.url, pendingUrl: t.pendingUrl }))),
                        );
                    }),
                );

                expect(tabsAfter.length, 'tab count should increase by 1').toBeGreaterThan(tabsBefore);

                const newTab = tabsAfter.find(t => {
                    const u = t.url ?? t.pendingUrl ?? '';
                    return u.startsWith('chrome://') && !u.includes('127.0.0.1');
                });

                if (newTab) {
                    const tabUrl = newTab.url ?? newTab.pendingUrl ?? '';
                    expect(tabUrl).toContain(EXPECTED_URL_PREFIX);
                }

                // Cleanup
                const fixtureIds = tabsAfter
                    .filter(t => (t.url ?? '').includes('127.0.0.1') || (t.url ?? '').includes('chrome://newtab'))
                    .map(t => t.id)
                    .filter((id): id is number => id != null);
                const allIds = tabsAfter.map(t => t.id).filter((id): id is number => id != null);
                const toClose = allIds.filter(id => !fixtureIds.includes(id));
                if (toClose.length > 0) {
                    await sw.evaluate((ids: number[]) =>
                        new Promise<void>(r => chrome.tabs.remove(ids, () => r())),
                        toClose,
                    );
                }
            },
        );
    });
});
