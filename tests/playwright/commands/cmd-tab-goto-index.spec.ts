import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const SUITE_LABEL = 'cmd_tab_goto_index';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
        });
    });
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

async function activateTabViaSW(ctx: BrowserContext, tabId: number): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { active: true }, () => resolve());
        });
    }, tabId);
}

test.describe('cmd_tab_goto_index (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        const p = await context.newPage();
        await p.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await p.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    // Open 3 fixture tabs, close all others, return the anchor page (index 0)
    async function openThreeTabs(): Promise<import('@playwright/test').Page> {
        for (const p of context.pages().slice(1)) await p.close().catch(() => {});
        const anchor = context.pages()[0];
        await anchor.goto(FIXTURE_URL, { waitUntil: 'load' });
        const tab1 = await context.newPage();
        await tab1.goto(FIXTURE_URL, { waitUntil: 'load' });
        const tab2 = await context.newPage();
        await tab2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await tab2.waitForTimeout(300);
        const tabs = await getTabsViaSW(context);
        expect(tabs.length).toBe(3);
        await callSKApi(anchor, 'unmapAllExcept', []);
        await callSKApi(anchor, 'mapcmdkey', 'tg', 'cmd_tab_goto_index');
        return anchor;
    }

    test('cmd_tab_goto_index with repeats=1 activates first tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const anchor = await openThreeTabs();
            const tabs = await getTabsViaSW(context);
            await activateTabViaSW(context, tabs.find((t: any) => t.index === 2).id);
            await anchor.waitForTimeout(200);

            const before = await getActiveTabViaSW(context);
            expect(before.index).toBe(2);

            await invokeCommand(anchor, 'cmd_tab_goto_index', 1);
            await anchor.waitForTimeout(500);

            const after = await getActiveTabViaSW(context);
            expect(after.index).toBe(0);
            if (DEBUG) console.log(`tg repeats=1: index ${before.index} → ${after.index}`);
        });
    });

    test('cmd_tab_goto_index with repeats=2 activates second tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const anchor = await openThreeTabs();
            const tabs = await getTabsViaSW(context);
            await activateTabViaSW(context, tabs.find((t: any) => t.index === 0).id);
            await anchor.bringToFront();
            await anchor.waitForTimeout(200);

            const before = await getActiveTabViaSW(context);
            expect(before.index).toBe(0);

            await invokeCommand(anchor, 'cmd_tab_goto_index', 2);
            await anchor.waitForTimeout(500);

            const after = await getActiveTabViaSW(context);
            expect(after.index).toBe(1);
            if (DEBUG) console.log(`tg repeats=2: index ${before.index} → ${after.index}`);
        });
    });

    test('cmd_tab_goto_index with repeats=3 activates third tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const anchor = await openThreeTabs();
            const tabs = await getTabsViaSW(context);
            await activateTabViaSW(context, tabs.find((t: any) => t.index === 0).id);
            await anchor.bringToFront();
            await anchor.waitForTimeout(200);

            const before = await getActiveTabViaSW(context);
            expect(before.index).toBe(0);

            await invokeCommand(anchor, 'cmd_tab_goto_index', 3);
            await anchor.waitForTimeout(500);

            const after = await getActiveTabViaSW(context);
            expect(after.index).toBe(2);
            if (DEBUG) console.log(`tg repeats=3: index ${before.index} → ${after.index}`);
        });
    });

    test('cmd_tab_goto_index clamps to last tab when repeats exceeds tab count', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const anchor = await openThreeTabs();
            const tabs = await getTabsViaSW(context);
            await activateTabViaSW(context, tabs.find((t: any) => t.index === 0).id);
            await anchor.bringToFront();
            await anchor.waitForTimeout(200);

            const before = await getActiveTabViaSW(context);
            expect(before.index).toBe(0);

            await invokeCommand(anchor, 'cmd_tab_goto_index', 99);
            await anchor.waitForTimeout(500);

            const after = await getActiveTabViaSW(context);
            const allTabs = await getTabsViaSW(context);
            expect(after.index).toBe(allTabs.length - 1);
            if (DEBUG) console.log(`tg clamp repeats=99: landed on index ${after.index} of ${allTabs.length}`);
        });
    });
});
