import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_bookmark_lookup_url';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const KEY = 'L';
const UNIQUE_ID = 'cmd_bookmark_lookup_url';
const TEST_FOLDER = 'test-lookup-folder';

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

test.describe('cmd_bookmark_lookup_url (Playwright)', () => {
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
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
    });

    test.afterEach(async () => {
        await cleanupFolder(context, TEST_FOLDER);
    });

    test('smoke: command is registered and executes without throw', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const ok = await invokeCommand(page, UNIQUE_ID);
            expect(ok).toBe(true);
        });
    });
});
