/**
 * Scratch test: cmd_bookmark_save_youtube_position (bv)
 *
 * Two levels of testing:
 * 1. Background handler — calls globalThis._handleMessage directly from the SW,
 *    simulating a real tab sender. Verifies bookmark create/replace/folder-create.
 * 2. E2E — injects .ytp-time-current into the fixture page, invokes the command
 *    via invokeCommand, and verifies the bookmark URL ends with ?t=<seconds>.
 *
 * Note: domain restriction was removed from the mapkey so the command is always
 * in commandRegistry; the if(!el) guard makes it a no-op on non-YouTube pages.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-bookmark-save-youtube.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FOLDER = 'scratch-yt-playback';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function getSW() {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw;
}

async function cleanupFolder(folderName: string) {
    const sw = await getSW();
    await sw.evaluate((name: string) => new Promise<void>(resolve => {
        chrome.bookmarks.search({ title: name }, results => {
            const folders = results.filter(r => !r.url && r.title === name);
            if (folders.length === 0) { resolve(); return; }
            let remaining = folders.length;
            for (const f of folders) {
                chrome.bookmarks.removeTree(f.id, () => { if (--remaining === 0) resolve(); });
            }
        });
    }), folderName);
}

async function getBookmarksInFolder(folderName: string): Promise<{ url?: string; title?: string }[]> {
    const sw = await getSW();
    return sw.evaluate((name: string) => new Promise<{ url?: string; title?: string }[]>(resolve => {
        chrome.bookmarks.search({ title: name }, results => {
            const folder = results.find(r => !r.url && r.title === name);
            if (!folder) { resolve([]); return; }
            chrome.bookmarks.getChildren(folder.id, children => {
                resolve((children || []).map(c => ({ url: c.url, title: c.title })));
            });
        });
    }), folderName);
}

/**
 * Invoke bookmarkSaveYoutubePosition via _handleMessage (the exposed test hook).
 * Simulates a message from the active tab.
 */
async function callHandlerDirect(p: Page, seconds: number, folder: string) {
    const sw = await getSW();
    const tab = await sw.evaluate((): Promise<{ id: number; url: string; title: string }> =>
        new Promise(resolve => {
            chrome.tabs.query({ active: true }, tabs =>
                resolve({ id: tabs[0]?.id ?? 0, url: tabs[0]?.url ?? '', title: tabs[0]?.title ?? '' })
            );
        })
    );

    await sw.evaluate(({ tabId, tabUrl, tabTitle, seconds, folder }) => {
        const msg = { action: 'bookmarkSaveYoutubePosition', seconds, folder };
        const sender = { tab: { id: tabId, url: tabUrl, title: tabTitle } };
        (globalThis as any)._handleMessage(msg, sender, () => {});
    }, { tabId: tab.id, tabUrl: tab.url, tabTitle: tab.title, seconds, folder });

    await p.waitForTimeout(400);
}

test.describe('cmd_bookmark_save_youtube_position — background handler (direct)', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await cov?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        await cleanupFolder(FOLDER);
    });

    test('creates bookmark in folder with ?t=<seconds>', async () => {
        await callHandlerDirect(page, 90, FOLDER);

        const bookmarks = await getBookmarksInFolder(FOLDER);
        expect(bookmarks).toHaveLength(1);
        expect(bookmarks[0].url).toContain('?t=90');
    });

    test('replaces stale bookmark on second call (same base URL)', async () => {
        await callHandlerDirect(page, 90, FOLDER);
        await callHandlerDirect(page, 150, FOLDER);

        const bookmarks = await getBookmarksInFolder(FOLDER);
        expect(bookmarks).toHaveLength(1);
        expect(bookmarks[0].url).toContain('?t=150');
        expect(bookmarks[0].url).not.toContain('t=90');
    });

    test('creates folder if it does not exist', async () => {
        await cleanupFolder(FOLDER);
        await callHandlerDirect(page, 30, FOLDER);

        const bookmarks = await getBookmarksInFolder(FOLDER);
        expect(bookmarks).toHaveLength(1);
        expect(bookmarks[0].url).toContain('?t=30');
    });
});

test.describe('cmd_bookmark_save_youtube_position — E2E via invokeCommand', () => {
    test.setTimeout(20_000);

    let e2eContext: BrowserContext;
    let e2ePage: Page;
    let e2eCov: ServiceWorkerCoverage | undefined;

    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        e2eContext = result.context;
        e2eCov = result.cov;
        e2ePage = await e2eContext.newPage();
        await e2ePage.goto(FIXTURE_URL, { waitUntil: 'load' });
        await e2ePage.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await e2eCov?.close();
        await e2eContext?.close();
    });

    test.afterEach(async () => {
        const sw = e2eContext.serviceWorkers()[0];
        if (sw) {
            await sw.evaluate((name: string) => new Promise<void>(resolve => {
                chrome.bookmarks.search({ title: name }, results => {
                    const folders = results.filter(r => !r.url && r.title === name);
                    if (folders.length === 0) { resolve(); return; }
                    let remaining = folders.length;
                    for (const f of folders) chrome.bookmarks.removeTree(f.id, () => { if (--remaining === 0) resolve(); });
                });
            }), 'playback');
        }
    });

    test('reads .ytp-time-current and creates bookmark via invokeCommand', async () => {
        // Inject YouTube-like time element into fixture page
        await e2ePage.evaluate(() => {
            const existing = document.querySelector('.ytp-time-current');
            if (existing) existing.remove();
            const el = document.createElement('span');
            el.className = 'ytp-time-current';
            el.textContent = '1:30'; // 90 seconds
            document.body.appendChild(el);
        });

        const ok = await invokeCommand(e2ePage, 'cmd_bookmark_save_youtube_position');
        expect(ok, 'invokeCommand should dispatch successfully').toBe(true);

        await e2ePage.waitForTimeout(400);

        const sw = e2eContext.serviceWorkers()[0];
        const bookmarks = await sw.evaluate((name: string) =>
            new Promise<{ url?: string }[]>(resolve => {
                chrome.bookmarks.search({ title: name }, results => {
                    const folder = results.find(r => !r.url && r.title === name);
                    if (!folder) { resolve([]); return; }
                    chrome.bookmarks.getChildren(folder.id, children =>
                        resolve(children.map(c => ({ url: c.url })))
                    );
                });
            }), 'playback');

        expect(bookmarks).toHaveLength(1);
        expect(bookmarks[0].url).toContain('?t=90');
    });

    test('time parsing: HH:MM:SS → correct seconds (5445)', async () => {
        await e2ePage.evaluate(() => {
            const existing = document.querySelector('.ytp-time-current');
            if (existing) existing.remove();
            const el = document.createElement('span');
            el.className = 'ytp-time-current';
            el.textContent = '1:30:45'; // 5445 seconds
            document.body.appendChild(el);
        });

        await invokeCommand(e2ePage, 'cmd_bookmark_save_youtube_position');
        await e2ePage.waitForTimeout(400);

        const sw = e2eContext.serviceWorkers()[0];
        const bookmarks = await sw.evaluate((name: string) =>
            new Promise<{ url?: string }[]>(resolve => {
                chrome.bookmarks.search({ title: name }, results => {
                    const folder = results.find(r => !r.url && r.title === name);
                    if (!folder) { resolve([]); return; }
                    chrome.bookmarks.getChildren(folder.id, children =>
                        resolve(children.map(c => ({ url: c.url })))
                    );
                });
            }), 'playback');

        expect(bookmarks).toHaveLength(1);
        expect(bookmarks[0].url).toContain('?t=5445');
    });
});
