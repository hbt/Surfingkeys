import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_bookmark_lookup_url';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

const TEST_FOLDER = '__sk_test_lookup_url_folder__';

test.describe('cmd_bookmark_lookup_url (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        const p = await context.newPage();
        await p.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        const sw = context.serviceWorkers()[0];
        await sw.evaluate((folderName: string) => {
            return new Promise<void>(resolve => {
                chrome.bookmarks.search({ title: folderName }, function(results) {
                    const folders = results.filter(r => !r.url && r.title === folderName);
                    if (!folders.length) { resolve(); return; }
                    let pending = folders.length;
                    folders.forEach(f => {
                        chrome.bookmarks.removeTree(f.id, () => { if (--pending === 0) resolve(); });
                    });
                });
            });
        }, TEST_FOLDER);
    });

    test('bookmarkLookupCurrentURL returns not bookmarked message when URL not found', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];

            // Remove any existing bookmarks for current tab URL first
            await sw.evaluate(() => {
                return new Promise<void>(resolve => {
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        const url = tabs[0]?.url;
                        if (!url) { resolve(); return; }
                        chrome.bookmarks.search({ url }, function(results) {
                            if (!results.length) { resolve(); return; }
                            let pending = results.length;
                            results.forEach(b => chrome.bookmarks.remove(b.id, () => { if (--pending === 0) resolve(); }));
                        });
                    });
                });
            });

            // Call handler directly (SW cannot sendMessage to itself)
            const response = await sw.evaluate(() => {
                return new Promise<{ msg: string }>(resolve => {
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        const tab = tabs[0] || { url: 'https://not-bookmarked.test/', id: 1, windowId: 1 };
                        (self as any).bookmarkLookupCurrentURL(
                            { action: 'bookmarkLookupCurrentURL', needResponse: true },
                            { tab },
                            (resp: unknown) => resolve(resp as { msg: string })
                        );
                    });
                });
            });

            if (DEBUG) console.log('Lookup response:', response);
            expect(response.msg).toContain('Not bookmarked');
        });
    });

    test('bookmarkLookupCurrentURL returns folder name when URL is bookmarked', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];

            // Get current active tab URL
            const currentUrl = await sw.evaluate(() => {
                return new Promise<string>(resolve => {
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        resolve(tabs[0]?.url || '');
                    });
                });
            });

            if (!currentUrl) {
                if (DEBUG) console.log('No active tab URL, skipping');
                return;
            }

            // Create test folder with current URL bookmarked
            await sw.evaluate(({ folderName, url }: { folderName: string; url: string }) => {
                return new Promise<void>(resolve => {
                    chrome.bookmarks.create({ parentId: '1', title: folderName }, function(folder) {
                        chrome.bookmarks.create({ parentId: folder.id, title: 'Current Tab', url }, function() {
                            resolve();
                        });
                    });
                });
            }, { folderName: TEST_FOLDER, url: currentUrl });

            // Call handler directly (SW cannot sendMessage to itself)
            const response = await sw.evaluate(() => {
                return new Promise<{ msg: string }>(resolve => {
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        const tab = tabs[0];
                        (self as any).bookmarkLookupCurrentURL(
                            { action: 'bookmarkLookupCurrentURL', needResponse: true },
                            { tab },
                            (resp: unknown) => resolve(resp as { msg: string })
                        );
                    });
                });
            });

            if (DEBUG) console.log('Lookup response with bookmark:', response);
            expect(response.msg).toContain('Found in:');
            expect(response.msg).toContain(TEST_FOLDER);
        });
    });
});
