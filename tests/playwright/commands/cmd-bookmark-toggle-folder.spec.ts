import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_bookmark_toggle_folder';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

// Default folder used by the settings.ts registration
const DEFAULT_FOLDER = 'default';

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function callSKApi(p: Page, fn: string, ...args: unknown[]) {
    await p.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a],
            bubbles: true,
            composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await p.waitForTimeout(100);
}

async function getFolderChildren(ctx: BrowserContext, folderName: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    const sw = ctx.serviceWorkers()[0];
    return sw.evaluate((name: string) => {
        return new Promise<any[]>(resolve => {
            chrome.bookmarks.search({ title: name }, function(results) {
                const folder = results.find(r => !r.url && r.title === name);
                if (!folder) { resolve([]); return; }
                chrome.bookmarks.getChildren(folder.id, children => resolve(children || []));
            });
        });
    }, folderName);
}

async function cleanupFolder(ctx: BrowserContext, folderName: string): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    await sw.evaluate((name: string) => {
        return new Promise<void>(resolve => {
            chrome.bookmarks.search({ title: name }, function(results) {
                const folders = results.filter(r => !r.url && r.title === name);
                if (!folders.length) { resolve(); return; }
                let pending = folders.length;
                folders.forEach(f => {
                    chrome.bookmarks.removeTree(f.id, () => { if (--pending === 0) resolve(); });
                });
            });
        });
    }, folderName);
}

test.describe('cmd_bookmark_toggle_folder (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        await cleanupFolder(context, DEFAULT_FOLDER);
    });

    test('bookmarkToggleFolder adds bookmark then removes it on second press', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.bringToFront();
                await page.waitForTimeout(200);

                // Ensure page focus
                await page.mouse.click(100, 100);
                await page.waitForTimeout(200);

                // Bind the command to a test key
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', 'q', 'cmd_bookmark_toggle_folder');

                // First press — should add bookmark to 'default' folder
                await page.keyboard.press('q');
                await page.waitForTimeout(800);

                const childrenAfterAdd = await getFolderChildren(context, DEFAULT_FOLDER);
                if (DEBUG) console.log('Children after first press:', childrenAfterAdd.length);
                expect(childrenAfterAdd.length).toBe(1);
                expect(childrenAfterAdd[0].url).toContain('scroll-test.html');

                // Second press — should remove the bookmark
                await page.keyboard.press('q');
                await page.waitForTimeout(800);

                const childrenAfterRemove = await getFolderChildren(context, DEFAULT_FOLDER);
                if (DEBUG) console.log('Children after second press:', childrenAfterRemove.length);
                expect(childrenAfterRemove.length).toBe(0);
            },
        );
    });
});
