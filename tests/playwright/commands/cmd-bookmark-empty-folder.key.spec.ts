import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_bookmark_empty_folder';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const KEY = 'b';
const UNIQUE_ID = 'cmd_bookmark_empty_folder';
const TEST_FOLDER = 'test-empty-folder';
const FOLDER_KEY = 'm';

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function callSKApi(p: Page, fn: string, ...args: unknown[]) {
    await p.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await p.waitForTimeout(100);
}

async function setConf(p: Page, key: string, value: unknown) {
    await p.evaluate(([k, v]) => {
        document.dispatchEvent(new CustomEvent('__sk_conf_override', {
            detail: { key: k, value: v }
        }));
    }, [key, value] as [string, unknown]);
    await p.waitForTimeout(50);
}

async function cleanupFolder(ctx: BrowserContext, folderName: string): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((name: string) => {
        return new Promise<void>((resolve) => {
            chrome.bookmarks.search({ title: name }, (results) => {
                const folders = results.filter(r => !r.url && r.title === name);
                if (folders.length === 0) { resolve(); return; }
                let remaining = folders.length;
                for (const f of folders) {
                    chrome.bookmarks.removeTree(f.id, () => {
                        remaining -= 1;
                        if (remaining === 0) resolve();
                    });
                }
            });
        });
    }, folderName);
}

async function seedFolder(ctx: BrowserContext, folderName: string, urls: string[]): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(({ name, urls }: { name: string; urls: string[] }) => {
        return new Promise<void>((resolve) => {
            chrome.bookmarks.create({ parentId: '1', title: name }, (folder) => {
                let remaining = urls.length;
                if (remaining === 0) { resolve(); return; }
                for (const url of urls) {
                    chrome.bookmarks.create({ parentId: folder.id, title: url, url }, () => {
                        remaining -= 1;
                        if (remaining === 0) resolve();
                    });
                }
            });
        });
    }, { name: folderName, urls });
}

async function getBookmarksInFolder(ctx: BrowserContext, folderName: string): Promise<{ id: string; url?: string; title?: string }[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((name: string) => {
        return new Promise<{ id: string; url?: string; title?: string }[]>((resolve) => {
            chrome.bookmarks.search({ title: name }, (results) => {
                const folder = results.find(r => !r.url && r.title === name);
                if (!folder) { resolve([]); return; }
                chrome.bookmarks.getChildren(folder.id, (children) => {
                    resolve((children || []).map(c => ({ id: c.id, url: c.url, title: c.title })));
                });
            });
        });
    }, folderName);
}

async function folderExists(ctx: BrowserContext, folderName: string): Promise<boolean> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((name: string) => {
        return new Promise<boolean>((resolve) => {
            chrome.bookmarks.search({ title: name }, (results) => {
                resolve(results.some(r => !r.url && r.title === name));
            });
        });
    }, folderName);
}

test.describe('cmd_bookmark_empty_folder (pending-key, Playwright)', () => {
    test.setTimeout(15_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await cleanupFolder(context, TEST_FOLDER);
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
        await setConf(page, 'bookmarkFolders', { [FOLDER_KEY]: TEST_FOLDER });
    });

    test.afterEach(async () => {
        await cleanupFolder(context, TEST_FOLDER);
    });

    test('empties folder with 3 items, folder still exists', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await seedFolder(context, TEST_FOLDER, [
                'https://example.com/a',
                'https://example.com/b',
                'https://example.com/c',
            ]);

            const before = await getBookmarksInFolder(context, TEST_FOLDER);
            expect(before).toHaveLength(3);

            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);
            await page.waitForTimeout(500);

            const after = await getBookmarksInFolder(context, TEST_FOLDER);
            expect(after).toHaveLength(0);

            const exists = await folderExists(context, TEST_FOLDER);
            expect(exists).toBe(true);
        });
    });

    test('empties folder with 1 item, count goes 1 → 0', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await seedFolder(context, TEST_FOLDER, ['https://example.com/single']);

            const before = await getBookmarksInFolder(context, TEST_FOLDER);
            expect(before).toHaveLength(1);

            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);
            await page.waitForTimeout(500);

            const after = await getBookmarksInFolder(context, TEST_FOLDER);
            expect(after).toHaveLength(0);

            const exists = await folderExists(context, TEST_FOLDER);
            expect(exists).toBe(true);
        });
    });
});
