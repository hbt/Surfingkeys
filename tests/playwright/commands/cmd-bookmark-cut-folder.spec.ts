import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_bookmark_cut_folder';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

const TEST_FOLDER = '__sk_test_cut_folder__';

async function createTestFolder(ctx: BrowserContext, urls: string[]): Promise<string> {
    const sw = ctx.serviceWorkers()[0];
    return sw.evaluate(([folderName, bookmarkUrls]: [string, string[]]) => {
        return new Promise<string>(resolve => {
            chrome.bookmarks.create({ parentId: '1', title: folderName }, function(folder) {
                let pending = bookmarkUrls.length;
                if (pending === 0) { resolve(folder.id); return; }
                bookmarkUrls.forEach((url, i) => {
                    chrome.bookmarks.create({ parentId: folder.id, title: `Item ${i}`, url }, function() {
                        if (--pending === 0) resolve(folder.id);
                    });
                });
            });
        });
    }, [TEST_FOLDER, urls] as [string, string[]]);
}

async function getFolderChildren(ctx: BrowserContext): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    const sw = ctx.serviceWorkers()[0];
    return sw.evaluate((name: string) => {
        return new Promise<any[]>(resolve => {
            chrome.bookmarks.search({ title: name }, function(results) {
                const folder = results.find(r => !r.url && r.title === name);
                if (!folder) { resolve([]); return; }
                chrome.bookmarks.getChildren(folder.id, children => resolve(children || []));
            });
        });
    }, TEST_FOLDER);
}

test.describe('cmd_bookmark_cut_folder (Playwright)', () => {
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

    test('bookmarkCutFromFolder removes 1 item (reversed = newest first)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await createTestFolder(context, [
                    'https://example-a.test/',
                    'https://example-b.test/',
                    'https://example-c.test/',
                ]);

                const sw = context.serviceWorkers()[0];
                await sw.evaluate(([folderName]: [string]) => {
                    return new Promise<void>(resolve => {
                        chrome.runtime.sendMessage({
                            action: 'bookmarkCutFromFolder',
                            folder: folderName,
                            reverse: true,
                            repeats: 1,
                        }, () => {});
                        setTimeout(resolve, 600);
                    });
                }, [TEST_FOLDER] as [string]);

                const children = await getFolderChildren(context);
                if (DEBUG) console.log('Children after cut:', children.length);
                // Started with 3, cut 1 → 2 remain
                expect(children.length).toBe(2);
            },
        );
    });

    test('bookmarkCutFromFolder does nothing when folder does not exist', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const sw = context.serviceWorkers()[0];
                const result = await sw.evaluate(([folderName]: [string]) => {
                    return new Promise<string>(resolve => {
                        try {
                            chrome.runtime.sendMessage({
                                action: 'bookmarkCutFromFolder',
                                folder: folderName,
                                reverse: true,
                                repeats: 1,
                            }, () => {});
                            setTimeout(() => resolve('ok'), 400);
                        } catch (e) {
                            resolve('error: ' + String(e));
                        }
                    });
                }, [TEST_FOLDER] as [string]);

                expect(result).toBe('ok');
            },
        );
    });
});
