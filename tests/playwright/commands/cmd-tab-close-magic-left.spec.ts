import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_magic_left';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

function assertBasicCoverage(bgPath: string | null, contentPath: string | null): void {
    if (process.env.COVERAGE !== 'true') return;
    expect(bgPath).toBeTruthy();
    if (bgPath) {
        const bg = readCoverageStats(bgPath, 'service_worker', 'background.js');
        expect(bg.total).toBeGreaterThan(0);
        expect(bg.zero).toBeGreaterThan(0);
        expect(bg.gt0).toBeGreaterThan(0);
    }
    if (contentPath) {
        const content = readCoverageStats(contentPath, 'page', 'content.js');
        expect(content.total).toBeGreaterThan(0);
        expect(content.zero).toBeGreaterThan(0);
        expect(content.gt0).toBeGreaterThan(0);
    }
}

async function getTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
        });
    });
}

async function pinTabViaSW(ctx: BrowserContext, tabId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { pinned: true }, () => resolve());
        });
    }, tabId);
}

async function waitForHttpPageCount(ctx: BrowserContext, expected: number) {
    for (let i = 0; i < 50; i++) {
        const httpCount = ctx.pages().filter(p => p.url().startsWith('http')).length;
        if (httpCount <= expected) break;
        await new Promise(r => setTimeout(r, 100));
    }
}

test.describe('cmd_tab_close_magic_left (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        for (const p of context.pages()) {
            await p.close().catch(() => {});
        }
    });
    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    async function closeAllExcept(keepPage: Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('cmd_tab_close_magic_left closes all tabs to the left', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_all`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // We need [l0, l1, l2, anchor, r]
        // Close anchor, open lefts, re-open anchor, open right
        await anchor.close();

        for (let i = 0; i < 3; i++) {
            const l = await context.newPage();
            await l.goto(FIXTURE_URL, { waitUntil: 'load' });
            await l.waitForTimeout(200);
        }

        const anchor2 = await context.newPage();
        await anchor2.goto(anchorUrl, { waitUntil: 'load' });
        await anchor2.waitForTimeout(200);

        const r = await context.newPage();
        await r.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r.waitForTimeout(200);

        await anchor2.bringToFront();
        await anchor2.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);
        const anchorTab = tabsBefore.find(t => t.url.includes(anchorUrl));
        expect(anchorTab).toBeTruthy();
        const leftCount = tabsBefore.filter(t => t.index < anchorTab!.index).length;
        expect(leftCount).toBe(3);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor2, 'cmd_tab_close_magic_left');

        await waitForHttpPageCount(context, tabsBefore.length - leftCount);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length - leftCount);
        expect(tabsAfter.every(t => t.index >= anchorTab!.index - leftCount)).toBe(true);
        if (DEBUG) console.log(`left_all: ${tabsBefore.length} → ${tabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    // Repeat count test: invokeCommand with repeats=2 closes exactly 2 closest tabs to the left
    test('cmd_tab_close_magic_left with repeat=2 closes 2 closest tabs to the left', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_repeat2`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Setup: [l0, l1, l2, anchor, r]
        // l0 should survive (furthest left)
        await anchor.close();

        const l0Url = `${FIXTURE_URL}#l0_marker`;
        const l0 = await context.newPage();
        await l0.goto(l0Url, { waitUntil: 'load' });
        await l0.waitForTimeout(200);

        for (let i = 1; i < 3; i++) {
            const l = await context.newPage();
            await l.goto(FIXTURE_URL, { waitUntil: 'load' });
            await l.waitForTimeout(200);
        }

        const anchor2 = await context.newPage();
        await anchor2.goto(anchorUrl, { waitUntil: 'load' });
        await anchor2.waitForTimeout(200);

        const r = await context.newPage();
        await r.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r.waitForTimeout(200);

        await anchor2.bringToFront();
        await anchor2.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);
        expect(tabsBefore.length).toBeGreaterThanOrEqual(5);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor2, 'cmd_tab_close_magic_left', 2);

        await waitForHttpPageCount(context, tabsBefore.length - 2);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length - 2);
        // l0 (furthest left) should still be open
        expect(tabsAfter.some(t => t.url.includes('l0_marker'))).toBe(true);
        if (DEBUG) console.log(`left_repeat2: ${tabsBefore.length} → ${tabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_left preserves pinned tabs to the left', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_pinned`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Setup: [l0_pinned, l1, anchor]
        await anchor.close();

        const pinnedUrl = `${FIXTURE_URL}#pinned_left_marker`;
        const l0 = await context.newPage();
        await l0.goto(pinnedUrl, { waitUntil: 'load' });
        await l0.waitForTimeout(200);

        const l1 = await context.newPage();
        await l1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l1.waitForTimeout(200);

        const anchor2 = await context.newPage();
        await anchor2.goto(anchorUrl, { waitUntil: 'load' });
        await anchor2.waitForTimeout(200);

        const tabsInit = await getTabsViaSW(context);
        const l0Tab = tabsInit.find(t => t.url.includes('pinned_left_marker'));
        expect(l0Tab).toBeTruthy();
        await pinTabViaSW(context, l0Tab!.id);

        await anchor2.bringToFront();
        await anchor2.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor2, 'cmd_tab_close_magic_left');

        await waitForHttpPageCount(context, tabsBefore.length - 1);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length - 1);
        // Pinned tab must still be open
        expect(tabsAfter.some(t => t.url.includes('pinned_left_marker'))).toBe(true);
        if (DEBUG) console.log(`left_pinned: ${tabsBefore.length} → ${tabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_left is no-op when active is leftmost', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/left_noop`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Setup: [anchor, r] — anchor is leftmost
        const r = await context.newPage();
        await r.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_left');

        // No tabs should close — wait briefly then check
        await anchor.waitForTimeout(500);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length);
        if (DEBUG) console.log(`left_noop: ${tabsBefore.length} → ${tabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
