import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_bookmark_remove_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

const TEST_FOLDER = '__sk_test_remove_m_folder__';

test.describe('cmd_bookmark_remove_m (Playwright)', () => {
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

    test('bookmarkRemoveM removes matching bookmark from folder', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];

            // Get the current tab URL so we can pre-seed it
            const currentUrl = await sw.evaluate(() => {
                return new Promise<string>(resolve => {
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        resolve(tabs[0]?.url || 'https://example.test');
                    });
                });
            });

            // Create folder with the current tab URL
            await sw.evaluate(({ folderName, url }: { folderName: string; url: string }) => {
                return new Promise<void>(resolve => {
                    chrome.bookmarks.create({ parentId: '1', title: folderName }, function(folder) {
                        chrome.bookmarks.create({ parentId: folder.id, title: 'Current Tab', url }, function() {
                            chrome.bookmarks.create({ parentId: folder.id, title: 'Other', url: 'https://other.test' }, function() {
                                resolve();
                            });
                        });
                    });
                });
            }, { folderName: TEST_FOLDER, url: currentUrl });

            const beforeCount = await sw.evaluate((folderName: string) => {
                return new Promise<number>(resolve => {
                    chrome.bookmarks.search({ title: folderName }, function(results) {
                        const folder = results.find(r => !r.url && r.title === folderName);
                        if (!folder) { resolve(0); return; }
                        chrome.bookmarks.getChildren(folder.id, children => resolve(children.length));
                    });
                });
            }, TEST_FOLDER);
            expect(beforeCount).toBe(2);

            // Invoke remove directly (SW cannot sendMessage to itself)
            await sw.evaluate((folderName: string) => {
                return new Promise<void>(resolve => {
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        const tab = tabs[0];
                        (self as any).bookmarkRemoveM(
                            { action: 'bookmarkRemoveM', folder: folderName, magic: 'CurrentTab', repeats: 1 },
                            { tab },
                            () => {}
                        );
                        setTimeout(resolve, 600);
                    });
                });
            }, TEST_FOLDER);

            const afterCount = await sw.evaluate((folderName: string) => {
                return new Promise<number>(resolve => {
                    chrome.bookmarks.search({ title: folderName }, function(results) {
                        const folder = results.find(r => !r.url && r.title === folderName);
                        if (!folder) { resolve(0); return; }
                        chrome.bookmarks.getChildren(folder.id, children => resolve(children.length));
                    });
                });
            }, TEST_FOLDER);

            if (DEBUG) console.log(`Children: before=${beforeCount}, after=${afterCount}`);
            // The current tab bookmark should be removed
            expect(afterCount).toBeLessThan(beforeCount);
        });
    });
});
