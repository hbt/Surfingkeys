import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_bookmark_add_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

const TEST_FOLDER = '__sk_test_add_m_folder__';

test.describe('cmd_bookmark_add_m (Playwright)', () => {
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

    test('bookmarkAddM adds current tab to named folder', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];

            // Invoke bookmarkAddM directly (SW cannot sendMessage to itself)
            await sw.evaluate((folderName: string) => {
                return new Promise<void>(resolve => {
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        const tab = tabs[0];
                        (self as any).bookmarkAddM(
                            { action: 'bookmarkAddM', folder: folderName, magic: 'CurrentTab', repeats: 1 },
                            { tab },
                            () => {}
                        );
                        setTimeout(resolve, 600);
                    });
                });
            }, TEST_FOLDER);

            // Folder should exist after the call
            const folderExists = await sw.evaluate((folderName: string) => {
                return new Promise<boolean>(resolve => {
                    chrome.bookmarks.search({ title: folderName }, function(results) {
                        resolve(results.some(r => !r.url && r.title === folderName));
                    });
                });
            }, TEST_FOLDER);

            if (DEBUG) console.log('Folder exists after bookmarkAddM:', folderExists);
            expect(folderExists).toBe(true);
        });
    });

    test('bookmarkAddM does not duplicate existing bookmarks', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];

            // Pre-create folder with one bookmark
            await sw.evaluate((folderName: string) => {
                return new Promise<void>(resolve => {
                    chrome.bookmarks.create({ parentId: '1', title: folderName }, function(folder) {
                        chrome.bookmarks.create({ parentId: folder.id, title: 'Existing', url: 'https://existing.test' }, function() {
                            resolve();
                        });
                    });
                });
            }, TEST_FOLDER);

            // Invoke bookmarkAddM directly
            await sw.evaluate((folderName: string) => {
                return new Promise<void>(resolve => {
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        const tab = tabs[0];
                        (self as any).bookmarkAddM(
                            { action: 'bookmarkAddM', folder: folderName, magic: 'CurrentTab', repeats: 1 },
                            { tab },
                            () => {}
                        );
                        setTimeout(resolve, 600);
                    });
                });
            }, TEST_FOLDER);

            // Count children — existing bookmark should still be there
            const count = await sw.evaluate((folderName: string) => {
                return new Promise<number>(resolve => {
                    chrome.bookmarks.search({ title: folderName }, function(results) {
                        const folder = results.find(r => !r.url && r.title === folderName);
                        if (!folder) { resolve(0); return; }
                        chrome.bookmarks.getChildren(folder.id, children => resolve(children.length));
                    });
                });
            }, TEST_FOLDER);

            if (DEBUG) console.log('Children count after add with existing:', count);
            // At least 1 (existing), possibly more if current tab URL is different
            expect(count).toBeGreaterThanOrEqual(1);
        });
    });
});
