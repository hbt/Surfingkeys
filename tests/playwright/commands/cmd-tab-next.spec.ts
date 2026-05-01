import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_next';
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

test.describe('cmd_tab_next (Playwright)', () => {
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

    async function closeAllExcept(keepPage: import('@playwright/test').Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('cmd_tab_next moves active tab from index 0 to index 1', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const tab0 = await context.newPage();
            await tab0.goto(FIXTURE_URL, { waitUntil: 'load' });
            await closeAllExcept(tab0);

            const tab1 = await context.newPage();
            await tab1.goto(FIXTURE_URL, { waitUntil: 'load' });
            await tab1.waitForTimeout(200);

            const allTabs = await getTabsViaSW(context);
            expect(allTabs.length).toBe(2);
            const tab0Info = allTabs.find((t: any) => t.index === 0);
            expect(tab0Info).toBeDefined();

            await activateTabViaSW(context, tab0Info!.id);
            await tab0.bringToFront();
            await tab0.waitForTimeout(300);

            const before = await getActiveTabViaSW(context);
            expect(before.index).toBe(0);

            await invokeCommand(tab0, 'cmd_tab_next');
            await tab0.waitForTimeout(500);

            const after = await getActiveTabViaSW(context);
            expect(after.index).toBe(1);
            if (DEBUG) console.log(`cmd_tab_next: index ${before.index} → ${after.index}`);
        });
    });

    test('cmd_tab_next wraps from last tab to index 0', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const tab0 = await context.newPage();
            await tab0.goto(FIXTURE_URL, { waitUntil: 'load' });
            await closeAllExcept(tab0);

            const tab1 = await context.newPage();
            await tab1.goto(FIXTURE_URL, { waitUntil: 'load' });
            await tab1.waitForTimeout(200);

            const allTabs = await getTabsViaSW(context);
            expect(allTabs.length).toBe(2);
            const lastTabInfo = allTabs.find((t: any) => t.index === 1);
            expect(lastTabInfo).toBeDefined();

            await activateTabViaSW(context, lastTabInfo!.id);
            await tab1.bringToFront();
            await tab1.waitForTimeout(300);

            const before = await getActiveTabViaSW(context);
            expect(before.index).toBe(1);

            await invokeCommand(tab1, 'cmd_tab_next');
            await tab1.waitForTimeout(500);

            const after = await getActiveTabViaSW(context);
            expect(after.index).toBe(0);
            if (DEBUG) console.log(`cmd_tab_next wrap: index ${before.index} → ${after.index}`);
        });
    });
});
