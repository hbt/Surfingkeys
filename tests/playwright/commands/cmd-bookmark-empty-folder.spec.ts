import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_bookmark_empty_folder';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

const TEST_FOLDER = '__sk_test_empty_folder__';

test.describe('cmd_bookmark_empty_folder (Playwright)', () => {
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

    test('bookmarkEmptyFolder removes all children from folder', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];

            // Create folder with 2 bookmarks
            await sw.evaluate((folderName: string) => {
                return new Promise<void>(resolve => {
                    chrome.bookmarks.create({ parentId: '1', title: folderName }, function(folder) {
                        chrome.bookmarks.create({ parentId: folder.id, title: 'A', url: 'https://a.test/' }, function() {
                            chrome.bookmarks.create({ parentId: folder.id, title: 'B', url: 'https://b.test/' }, function() {
                                resolve();
                            });
                        });
                    });
                });
            }, TEST_FOLDER);

            // Verify 2 children before
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

            // Invoke empty folder handler (SW cannot sendMessage to itself)
            await sw.evaluate((folderName: string) => {
                return new Promise<void>(resolve => {
                    (self as any).bookmarkEmptyFolder(
                        { action: 'bookmarkEmptyFolder', folder: folderName },
                        {},
                        () => {}
                    );
                    setTimeout(resolve, 600);
                });
            }, TEST_FOLDER);

            // Verify folder exists but has 0 children
            const afterCount = await sw.evaluate((folderName: string) => {
                return new Promise<number>(resolve => {
                    chrome.bookmarks.search({ title: folderName }, function(results) {
                        const folder = results.find(r => !r.url && r.title === folderName);
                        if (!folder) { resolve(-1); return; }
                        chrome.bookmarks.getChildren(folder.id, children => resolve(children.length));
                    });
                });
            }, TEST_FOLDER);

            if (DEBUG) console.log(`Children after empty: ${afterCount}`);
            expect(afterCount).toBe(0);
        });
    });

    test('bookmarkEmptyFolder does nothing when folder does not exist', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];

            const result = await sw.evaluate((folderName: string) => {
                return new Promise<string>(resolve => {
                    try {
                        (self as any).bookmarkEmptyFolder(
                            { action: 'bookmarkEmptyFolder', folder: folderName },
                            {},
                            () => {}
                        );
                        setTimeout(() => resolve('ok'), 400);
                    } catch(e) {
                        resolve('error: ' + String(e));
                    }
                });
            }, TEST_FOLDER);

            expect(result).toBe('ok');
        });
    });
});
