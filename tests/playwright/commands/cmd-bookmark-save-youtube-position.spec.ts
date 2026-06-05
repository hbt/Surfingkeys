import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

async function callSKApi(p: Page, fn: string, ...args: unknown[]) {
    await p.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await p.waitForTimeout(100);
}

const SUITE_LABEL = 'cmd_bookmark_save_youtube_position';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_bv`;
const FOLDER = 'playback';

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function cleanupFolder(ctx: BrowserContext, folderName: string) {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate((name: string) => new Promise<void>(resolve => {
        chrome.bookmarks.search({ title: name }, results => {
            const folders = results.filter(r => !r.url && r.title === name);
            if (folders.length === 0) { resolve(); return; }
            let remaining = folders.length;
            for (const f of folders) chrome.bookmarks.removeTree(f.id, () => { if (--remaining === 0) resolve(); });
        });
    }), folderName);
}

async function getBookmarksInFolder(ctx: BrowserContext, folderName: string): Promise<{ url?: string }[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) return [];
    return sw.evaluate((name: string) => new Promise<{ url?: string }[]>(resolve => {
        chrome.bookmarks.search({ title: name }, results => {
            const folder = results.find(r => !r.url && r.title === name);
            if (!folder) { resolve([]); return; }
            chrome.bookmarks.getChildren(folder.id, children =>
                resolve(children.map(c => ({ url: c.url })))
            );
        });
    }), folderName);
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
            if (text !== null && text !== '') return text;
        }
        await p.waitForTimeout(100);
    }
    return null;
}

async function injectTimeElement(p: Page, timeText: string) {
    await p.evaluate((text: string) => {
        const existing = document.querySelector('.ytp-time-current');
        if (existing) existing.remove();
        const el = document.createElement('span');
        el.className = 'ytp-time-current';
        el.textContent = text;
        document.body.appendChild(el);
    }, timeText);
}

test.describe('cmd_bookmark_save_youtube_position (Playwright)', () => {
    test.setTimeout(15_000);

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

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'bv', 'cmd_bookmark_save_youtube_position');
    });

    test.afterEach(async () => {
        await cleanupFolder(context, FOLDER);
    });

    test('creates bookmark with ?t=<seconds> from MM:SS time', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await injectTimeElement(page, '1:30'); // 90 seconds

            const ok = await invokeCommand(page, 'cmd_bookmark_save_youtube_position');
            expect(ok).toBe(true);
            await page.waitForTimeout(400);

            const bookmarks = await getBookmarksInFolder(context, FOLDER);
            expect(bookmarks).toHaveLength(1);
            expect(bookmarks[0].url).toContain('?t=90');

            const bannerText = await waitForBannerVisible(page);
            expect(bannerText).not.toBeNull();
            expect(bannerText).toContain('Saved playback position (1:30)');
        });
    });

    test('replaces stale bookmark on re-invoke (same base URL)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await injectTimeElement(page, '1:30'); // 90 s
            await invokeCommand(page, 'cmd_bookmark_save_youtube_position');
            await page.waitForTimeout(300);

            await injectTimeElement(page, '2:30'); // 150 s
            await invokeCommand(page, 'cmd_bookmark_save_youtube_position');
            await page.waitForTimeout(400);

            const bookmarks = await getBookmarksInFolder(context, FOLDER);
            expect(bookmarks).toHaveLength(1);
            expect(bookmarks[0].url).toContain('?t=150');
            expect(bookmarks[0].url).not.toContain('t=90');

            const bannerText2 = await waitForBannerVisible(page);
            expect(bannerText2).not.toBeNull();
            expect(bannerText2).toContain('Saved playback position (2:30)');
        });
    });

    test('parses HH:MM:SS correctly', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await injectTimeElement(page, '1:30:45'); // 5445 seconds

            await invokeCommand(page, 'cmd_bookmark_save_youtube_position');
            await page.waitForTimeout(400);

            const bookmarks = await getBookmarksInFolder(context, FOLDER);
            expect(bookmarks).toHaveLength(1);
            expect(bookmarks[0].url).toContain('?t=5445');

            const bannerText3 = await waitForBannerVisible(page);
            expect(bannerText3).not.toBeNull();
            expect(bannerText3).toContain('Saved playback position (1:30:45)');
        });
    });
});
