import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_magic_right';
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

async function waitForTabCount(activePage: Page, expected: number) {
    const ctx = activePage.context();
    for (let i = 0; i < 50; i++) {
        await activePage.waitForTimeout(100).catch(() => {});
        if (ctx.pages().length <= expected) break;
    }
}

test.describe('cmd_tab_close_magic_right (Playwright)', () => {
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

    test('cmd_tab_close_magic_right closes all tabs to the right', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/right_all`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Setup: [anchor, r0, r1, r2]
        for (let i = 0; i < 3; i++) {
            const r = await context.newPage();
            await r.goto(FIXTURE_URL, { waitUntil: 'load' });
            await r.waitForTimeout(200);
        }

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);
        const anchorTab = tabsBefore.find(t => t.url.includes(anchorUrl));
        expect(anchorTab).toBeTruthy();
        const rightCount = tabsBefore.filter(t => t.index > anchorTab!.index).length;
        expect(rightCount).toBe(3);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_right');

        await waitForHttpPageCount(context, tabsBefore.length - rightCount);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length - rightCount);
        expect(tabsAfter.every(t => t.index <= anchorTab!.index)).toBe(true);
        if (DEBUG) console.log(`right_all: ${tabsBefore.length} → ${tabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    // Repeat count test: invokeCommand with repeats=2 closes exactly 2 tabs to the right
    test('cmd_tab_close_magic_right with repeat=2 closes 2 tabs to the right', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/right_repeat2`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Setup: [anchor, r0, r1, r2] — r2 should survive
        const r2Url = `${FIXTURE_URL}#r2_marker`;
        for (let i = 0; i < 2; i++) {
            const r = await context.newPage();
            await r.goto(FIXTURE_URL, { waitUntil: 'load' });
            await r.waitForTimeout(200);
        }
        const r2 = await context.newPage();
        await r2.goto(r2Url, { waitUntil: 'load' });
        await r2.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);
        expect(tabsBefore.length).toBeGreaterThanOrEqual(4);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_right', 2);

        await waitForHttpPageCount(context, tabsBefore.length - 2);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length - 2);
        // r2 (rightmost) should still be open
        expect(tabsAfter.some(t => t.url.includes('r2_marker'))).toBe(true);
        if (DEBUG) console.log(`right_repeat2: ${tabsBefore.length} → ${tabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_right preserves pinned tabs to the right', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/right_pinned`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Setup: [anchor, r0, r1_pinned]
        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const pinnedUrl = `${FIXTURE_URL}#pinned_marker`;
        const r1 = await context.newPage();
        await r1.goto(pinnedUrl, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        const tabsInit = await getTabsViaSW(context);
        const r1Tab = tabsInit.find(t => t.url.includes('pinned_marker'));
        expect(r1Tab).toBeTruthy();
        await pinTabViaSW(context, r1Tab!.id);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_right');

        await waitForHttpPageCount(context, tabsBefore.length - 1);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length - 1);
        // Pinned tab must still be open
        expect(tabsAfter.some(t => t.url.includes('pinned_marker'))).toBe(true);
        if (DEBUG) console.log(`right_pinned: ${tabsBefore.length} → ${tabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_right is no-op when active is rightmost', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/right_noop`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // Setup: [l, anchor] — anchor is rightmost
        const l = await context.newPage();
        await l.goto(FIXTURE_URL, { waitUntil: 'load' });
        await l.waitForTimeout(200);
        // Reopen anchor to the right of l
        await anchor.close();
        const anchor2 = await context.newPage();
        await anchor2.goto(anchorUrl, { waitUntil: 'load' });
        await anchor2.waitForTimeout(200);

        await anchor2.bringToFront();
        await anchor2.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor2, 'cmd_tab_close_magic_right');

        // No tabs should close — wait briefly then check
        await anchor2.waitForTimeout(500);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(tabsBefore.length);
        if (DEBUG) console.log(`right_noop: ${tabsBefore.length} → ${tabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    test('cmd_tab_close_magic_right closes all right when active is leftmost', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/right_leftmost`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        // anchor is the only page, open r0 and r1 to the right
        const r0 = await context.newPage();
        await r0.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r0.waitForTimeout(200);

        const r1 = await context.newPage();
        await r1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await r1.waitForTimeout(200);

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const tabsBefore = await getTabsViaSW(context);
        const anchorTab = tabsBefore.find(t => t.url.includes(anchorUrl));
        expect(anchorTab).toBeTruthy();
        const rightCount = tabsBefore.filter(t => t.index > anchorTab!.index).length;
        expect(rightCount).toBe(2);

        await covBg?.snapshot();
        await covContent?.snapshot();

        await invokeCommand(anchor, 'cmd_tab_close_magic_right');

        await waitForHttpPageCount(context, tabsBefore.length - rightCount);

        const tabsAfter = await getTabsViaSW(context);
        expect(tabsAfter.length).toBe(1);
        expect(tabsAfter[0].url).toContain(anchorUrl);
        if (DEBUG) console.log(`right_leftmost: ${tabsBefore.length} → ${tabsAfter.length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });

    // Repeat count test uses key dispatch (specifically tests 2gxe chord + RUNTIME.repeats flow)
    test('2gxe closes 2 tabs to the right (repeat count via key dispatch)', async () => {
        const anchorUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/2gxe_closes_2_tabs_to_the_right_repeat_count_via_key_dispatch`)}`;
        const anchor = await context.newPage();
        await anchor.goto(anchorUrl, { waitUntil: 'load' });
        await closeAllExcept(anchor);

        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
        }

        await anchor.bringToFront();
        await anchor.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(anchorUrl);

        const beforeCount = context.pages().length;
        expect(beforeCount).toBeGreaterThanOrEqual(4);

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        for (const key of ['2', 'g', 'x', 'e']) {
            await anchor.keyboard.press(key).catch(() => {});
            await anchor.waitForTimeout(50);
        }

        await waitForTabCount(anchor, beforeCount - 2);

        expect(context.pages().length).toBe(beforeCount - 2);
        if (DEBUG) console.log(`2gxe: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
