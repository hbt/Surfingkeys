import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_bookmark_youtube_playlist';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const KEY = 'b';
const FOLDER_KEY = 'm';
const UNIQUE_ID = 'cmd_bookmark_youtube_playlist';
const TEST_FOLDER = 'test-yt-playlist-folder';

const YT_URL_1 = 'https://www.youtube.com/watch?v=EHLI2WZUtXs';
const YT_URL_2 = 'https://www.youtube.com/watch?v=YNJvm7t3yq8';
const YT_URL_3 = 'https://www.youtube.com/watch?v=FWEInOtngmM';
const NON_YT_URL = 'https://www.example.com/not-youtube';

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
    await sw.evaluate((name: string) => new Promise<void>(resolve => {
        chrome.bookmarks.search({ title: name }, results => {
            const folders = results.filter(r => !r.url && r.title === name);
            if (folders.length === 0) { resolve(); return; }
            let remaining = folders.length;
            for (const f of folders) chrome.bookmarks.removeTree(f.id, () => { if (--remaining === 0) resolve(); });
        });
    }), folderName);
}

async function seedFolderOrdered(ctx: BrowserContext, folderName: string, urls: string[]): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(({ name, urls }: { name: string; urls: string[] }) => new Promise<void>(resolve => {
        chrome.bookmarks.create({ parentId: '1', title: name }, folder => {
            if (urls.length === 0) { resolve(); return; }
            function addNext(i: number) {
                if (i >= urls.length) { resolve(); return; }
                chrome.bookmarks.create({ parentId: folder.id, title: urls[i], url: urls[i] }, () => addNext(i + 1));
            }
            addNext(0);
        });
    }), { name: folderName, urls });
}

test.describe('cmd_bookmark_youtube_playlist (pending-key, Playwright)', () => {
    test.setTimeout(20_000);

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
        test.skip(!process.env.DOCKER_CI, 'requires real YouTube navigation — only runs in Docker CI');
        await cleanupFolder(context, TEST_FOLDER);
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
        await setConf(page, 'bookmarkFolders', { [FOLDER_KEY]: TEST_FOLDER });
    });

    test.afterEach(async () => {
        await cleanupFolder(context, TEST_FOLDER);
    });

    test('navigates to YouTube watch_videos playlist URL', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await seedFolderOrdered(context, TEST_FOLDER, [YT_URL_1, YT_URL_2, NON_YT_URL]);

            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);

            await page.waitForURL(/youtube\.com/, { timeout: 8_000 });

            const url = page.url();
            // YouTube redirects watch_videos?video_ids=... to a regular watch URL with list= param
            expect(url).toContain('youtube.com');
            expect(url).not.toContain('example.com');
        });
    });

    test('repeat=2 limits playlist to 2 videos (2bm)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Seed in order [1, 2, 3]. reverse=true → [3, 2, 1]. repeat=2 → [3, 2].
            await seedFolderOrdered(context, TEST_FOLDER, [YT_URL_1, YT_URL_2, YT_URL_3]);

            // Capture watch_videos URL before YouTube redirects it
            const requestPromise = page.waitForRequest(
                req => req.url().includes('watch_videos'),
                { timeout: 8_000 }
            );

            await page.keyboard.press('2');
            await page.waitForTimeout(50);
            await page.keyboard.press(KEY);
            await page.waitForTimeout(50);
            await page.keyboard.press(FOLDER_KEY);

            const request = await requestPromise;
            const url = request.url();
            expect(url).toContain('watch_videos?video_ids=');
            // reversed order → [FWEInOtngmM, YNJvm7t3yq8, EHLI2WZUtXs]; first 2 taken
            expect(url).toContain('FWEInOtngmM');
            expect(url).toContain('YNJvm7t3yq8');
            expect(url).not.toContain('EHLI2WZUtXs');
        });
    });
});
