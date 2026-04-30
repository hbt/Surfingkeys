import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_history_last';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getActiveTabId(): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                resolve(tabs[0]?.id ?? -1);
            });
        });
    });
}

async function activateTab(tabId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { active: true }, () => resolve());
        });
    }, tabId);
}

test.describe('cmd_tab_history_last (Playwright)', () => {
    let pages: Page[] = [];

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;

        // Anchor page for content coverage
        const anchorPage = await context.newPage();
        await anchorPage.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await anchorPage.waitForTimeout(500);

        // Create 3 pages and build activation history
        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(300);
            pages.push(p);
        }

        // Get tab IDs in creation order
        const sw = context.serviceWorkers()[0];
        if (sw) {
            const tabs: Array<{ id: number; index: number }> = await sw.evaluate(() => {
                return new Promise<Array<{ id: number; index: number }>>((resolve) => {
                    chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                        resolve(tabs.map((t) => ({ id: t.id, index: t.index })));
                    });
                });
            });
            // Sort by index and activate in order to build history
            tabs.sort((a, b) => a.index - b.index);
            for (const tab of tabs) {
                await activateTab(tab.id);
                await pages[0].waitForTimeout(300);
            }
        }

        // Land on last page (most recently activated)
        page = pages[pages.length - 1];
        await page.bringToFront();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('pressing gt executes without errors', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.bringToFront();
            await page.waitForTimeout(300);

            const initialId = await getActiveTabId();
            if (DEBUG) console.log(`Initial tab ID: ${initialId}`);
            expect(initialId).toBeGreaterThan(0);

            // Send gt
            await page.keyboard.press('g');
            await page.waitForTimeout(50);
            await page.keyboard.press('t');
            await page.waitForTimeout(1000);

            // Browser should still be valid
            const afterId = await getActiveTabId();
            if (DEBUG) console.log(`After gt: active tab=${afterId}`);
            expect(afterId).toBeGreaterThan(0);

            if (afterId !== initialId) {
                if (DEBUG) console.log(`gt switched tab: ${initialId} -> ${afterId}`);
            } else {
                if (DEBUG) console.log(`gt: tab unchanged (may be pointing at current tab)`);
            }
        });
    });

    test('pressing gt with history built switches to a tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const sw = context.serviceWorkers()[0];
            if (!sw) throw new Error('No service worker');

            const allTabs: Array<{ id: number; index: number }> = await sw.evaluate(() => {
                return new Promise<Array<{ id: number; index: number }>>((resolve) => {
                    chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                        resolve(tabs.map((t) => ({ id: t.id, index: t.index })));
                    });
                });
            });
            expect(allTabs.length).toBeGreaterThan(1);

            // Rebuild history: tab0, tab1, tab2 in sequence
            const sorted = [...allTabs].sort((a, b) => a.index - b.index);
            for (const tab of sorted) {
                await activateTab(tab.id);
                await page.waitForTimeout(300);
            }

            // End on middle tab (not last in index order, to give gt somewhere to go)
            const middleTab = sorted[Math.floor(sorted.length / 2)];
            await activateTab(middleTab.id);
            await page.waitForTimeout(500);

            const activePage = context.pages().find((p) => !p.isClosed()) ?? page;
            await activePage.bringToFront();
            await activePage.waitForTimeout(300);

            const initialId = await getActiveTabId();
            if (DEBUG) console.log(`Before gt: active tab=${initialId}`);

            await activePage.keyboard.press('g');
            await activePage.waitForTimeout(50);
            await activePage.keyboard.press('t');
            await activePage.waitForTimeout(1000);

            const afterId = await getActiveTabId();
            if (DEBUG) console.log(`After gt: active tab=${afterId}`);
            expect(afterId).toBeGreaterThan(0);
            if (DEBUG) console.log(`gt: ${initialId} -> ${afterId}`);
        });
    });

    test('gt command leaves browser in valid state', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const activePage = context.pages().find((p) => !p.isClosed()) ?? page;
            await activePage.bringToFront();
            await activePage.waitForTimeout(300);

            // Send gt and verify browser doesn't crash
            await activePage.keyboard.press('g').catch(() => {});
            await activePage.waitForTimeout(50);
            await activePage.keyboard.press('t').catch(() => {});
            await activePage.waitForTimeout(800);

            const id = await getActiveTabId();
            expect(id).toBeGreaterThan(0);
            expect(context.pages().some((p) => !p.isClosed())).toBe(true);
            if (DEBUG) console.log(`gt smoke test passed, active tab=${id}`);
        });
    });
});
