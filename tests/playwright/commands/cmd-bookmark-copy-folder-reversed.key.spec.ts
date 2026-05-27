import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_bookmark_copy_folder_reversed';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const KEY = 'b';
const UNIQUE_ID = 'cmd_bookmark_copy_folder_reversed';
const TEST_FOLDER = 'test-copy-reversed-folder';
const FOLDER_KEY = 'm';

const URL_A = 'https://example.com/alpha';
const URL_B = 'https://example.com/beta';
const URL_C = 'https://example.com/gamma';

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

async function seedFolderOrdered(ctx: BrowserContext, folderName: string, urls: string[]): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(({ name, urls }: { name: string; urls: string[] }) => {
        return new Promise<void>((resolve) => {
            chrome.bookmarks.create({ parentId: '1', title: name }, (folder) => {
                if (urls.length === 0) { resolve(); return; }
                function addNext(i: number) {
                    if (i >= urls.length) { resolve(); return; }
                    chrome.bookmarks.create({ parentId: folder.id, title: urls[i], url: urls[i] }, () => addNext(i + 1));
                }
                addNext(0);
            });
        });
    }, { name: folderName, urls });
}

async function getBookmarksInFolder(ctx: BrowserContext, folderName: string): Promise<{ url?: string }[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((name: string) => {
        return new Promise<{ url?: string }[]>((resolve) => {
            chrome.bookmarks.search({ title: name }, (results) => {
                const folder = results.find(r => !r.url && r.title === name);
                if (!folder) { resolve([]); return; }
                chrome.bookmarks.getChildren(folder.id, (children) => {
                    resolve((children || []).map(c => ({ url: c.url })));
                });
            });
        });
    }, folderName);
}

test.describe('cmd_bookmark_copy_folder_reversed (pending-key, Playwright)', () => {
    test.setTimeout(15_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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

    test('command is registered and folder is non-destructive after copy', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Verify registration
            const ok = await invokeCommand(page, UNIQUE_ID);
            expect(ok).toBe(true);

            await seedFolderOrdered(context, TEST_FOLDER, [URL_A, URL_B, URL_C]);

            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);
            await page.waitForTimeout(500);

            // Copy is non-destructive — all 3 items must still be present in original order
            const after = await getBookmarksInFolder(context, TEST_FOLDER);
            expect(after.map(b => b.url)).toEqual([URL_A, URL_B, URL_C]);
        });
    });

    test('copies all URLs in reversed order', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await seedFolderOrdered(context, TEST_FOLDER, [URL_A, URL_B, URL_C]);

            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);
            await page.waitForTimeout(300);

            const clip = await page.evaluate(() => navigator.clipboard.readText());
            expect(clip.split('\n')).toEqual([URL_C, URL_B, URL_A]);
        });
    });

    test('repeats limits number of URLs copied (reversed)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await seedFolderOrdered(context, TEST_FOLDER, [URL_A, URL_B, URL_C]);

            await page.keyboard.press('2');
            await page.waitForTimeout(30);
            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);
            await page.waitForTimeout(300);

            const clip = await page.evaluate(() => navigator.clipboard.readText());
            expect(clip.split('\n')).toEqual([URL_C, URL_B]);
        });
    });
});
