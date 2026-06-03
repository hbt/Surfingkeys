import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_bookmark_remove_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const KEY = 'b';
const UNIQUE_ID = 'cmd_bookmark_remove_m';
const TEST_FOLDER = 'test-remove-m-folder';
const FOLDER_KEY = 'm';
const MAGIC_KEY = 't'; // 't' → CurrentTab

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

async function waitForBannerVisible(p: Page, timeoutMs = 5000): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const frame of p.frames()) {
            if (!frame.url().includes('frontend.html')) continue;
            const text = await frame.evaluate(() => {
                const banner = document.getElementById('sk_banner');
                if (!banner) return null;
                if (banner.style.display === 'none') return null;
                return banner.textContent ?? null;
            }).catch(() => null);
            if (text !== null) return text;
        }
        await p.waitForTimeout(100);
    }
    return null;
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

test.describe('cmd_bookmark_remove_m (pending-key, Playwright)', () => {
    test.setTimeout(17_000);

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
        await setConf(page, 'bookmarkMagicKeys', { [MAGIC_KEY]: 'CurrentTab' });
    });

    test.afterEach(async () => {
        await cleanupFolder(context, TEST_FOLDER);
    });

    test('removes current tab URL from folder', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];
            await sw.evaluate(({ name, url }: { name: string; url: string }) => {
                return new Promise<void>((resolve) => {
                    chrome.bookmarks.create({ parentId: '1', title: name }, (folder) => {
                        chrome.bookmarks.create({ parentId: folder.id, title: 'test', url }, () => resolve());
                    });
                });
            }, { name: TEST_FOLDER, url: FIXTURE_URL });

            const before = await getBookmarksInFolder(context, TEST_FOLDER);
            expect(before).toHaveLength(1);

            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(MAGIC_KEY);
            await page.waitForTimeout(500);

            const bannerText = await waitForBannerVisible(page);
            expect(bannerText).not.toBeNull();
            expect(bannerText).toContain(`Removed 1 from [${TEST_FOLDER}]`);

            const after = await getBookmarksInFolder(context, TEST_FOLDER);
            expect(after).toHaveLength(0);
        });
    });

    test('removes all tabs to the right when magic key is DirectionRight', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await setConf(page, 'bookmarkMagicKeys', { [MAGIC_KEY]: 'CurrentTab', 'e': 'DirectionRight' });

            const rightUrls = [
                `${FIXTURE_BASE}/scroll-test.html#right1`,
                `${FIXTURE_BASE}/scroll-test.html#right2`,
                `${FIXTURE_BASE}/scroll-test.html#right3`,
            ];

            // Pre-populate the folder with the 3 right-tab URLs + an unrelated one
            const sw = context.serviceWorkers()[0];
            await sw.evaluate(({ name, urls }: { name: string; urls: string[] }) => {
                return new Promise<void>((resolve) => {
                    chrome.bookmarks.create({ parentId: '1', title: name }, (folder) => {
                        let remaining = urls.length;
                        for (const url of urls) {
                            chrome.bookmarks.create({ parentId: folder.id, title: url, url }, () => {
                                remaining -= 1;
                                if (remaining === 0) resolve();
                            });
                        }
                    });
                });
            }, { name: TEST_FOLDER, urls: rightUrls });

            const rightPages = [];
            for (const url of rightUrls) {
                const p = await context.newPage();
                await p.goto(url, { waitUntil: 'load' });
                rightPages.push(p);
            }

            await page.bringToFront();
            await page.waitForTimeout(200);

            // b → m → e  (trigger → folder key → magic key)
            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press('e');
            await page.waitForTimeout(500);

            const bannerText = await waitForBannerVisible(page);
            expect(bannerText).not.toBeNull();
            expect(bannerText).toContain(`Removed 3 from [${TEST_FOLDER}]`);

            const after = await getBookmarksInFolder(context, TEST_FOLDER);
            expect(after).toHaveLength(0);

            for (const p of rightPages) {
                await p.close();
            }
        });
    });

    test('no-op if URL not in folder', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];
            // Folder with a different URL
            await sw.evaluate((name: string) => {
                return new Promise<void>((resolve) => {
                    chrome.bookmarks.create({ parentId: '1', title: name }, (folder) => {
                        chrome.bookmarks.create({ parentId: folder.id, title: 'other', url: 'https://example.com/other' }, () => resolve());
                    });
                });
            }, TEST_FOLDER);

            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(MAGIC_KEY);
            await page.waitForTimeout(500);

            const bannerText = await waitForBannerVisible(page);
            expect(bannerText).not.toBeNull();
            expect(bannerText).toContain(`Removed 0 from [${TEST_FOLDER}]`);

            // Different URL → should remain untouched
            const after = await getBookmarksInFolder(context, TEST_FOLDER);
            expect(after).toHaveLength(1);
        });
    });
});
