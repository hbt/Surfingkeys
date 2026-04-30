import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_move_right';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getTabById(tabId: number): Promise<{ id: number; index: number } | null> {
    const sw = context.serviceWorkers()[0];
    if (!sw) return null;
    return sw.evaluate((id: number) => {
        return new Promise<{ id: number; index: number } | null>((resolve) => {
            chrome.tabs.get(id, (tab: any) => {
                if (chrome.runtime.lastError || !tab) {
                    resolve(null);
                } else {
                    resolve({ id: tab.id, index: tab.index });
                }
            });
        });
    }, tabId);
}

async function getActiveTabInfo(): Promise<{ id: number; index: number }> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<{ id: number; index: number }>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                resolve({ id: tabs[0].id, index: tabs[0].index });
            });
        });
    });
}

async function getAllTabsInfo(): Promise<Array<{ id: number; index: number }>> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<Array<{ id: number; index: number }>>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                resolve(tabs.map((t) => ({ id: t.id, index: t.index })));
            });
        });
    });
}

test.describe('cmd_tab_move_right (Playwright)', () => {
    let pages: Page[] = [];

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        // Create 4 pages — we'll focus the first (leftmost) one to move right
        for (let i = 0; i < 4; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(300);
            pages.push(p);
        }
        // Focus the first page so there is room to move right
        page = pages[0];
        await page.bringToFront();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('pressing >> moves tab one position to the right', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.bringToFront();
            await page.waitForTimeout(300);

            const initialInfo = await getActiveTabInfo();
            const initialIndex = initialInfo.index;
            const initialId = initialInfo.id;
            if (DEBUG) console.log(`Initial tab: id=${initialId}, index=${initialIndex}`);

            // Press >> to move tab right
            await page.keyboard.press('Shift+Period');
            await page.waitForTimeout(50);
            await page.keyboard.press('Shift+Period');
            await page.waitForTimeout(500);

            // Poll for position change
            let movedTab: { id: number; index: number } | null = null;
            for (let i = 0; i < 20; i++) {
                const current = await getTabById(initialId);
                if (current && current.index !== initialIndex) {
                    movedTab = current;
                    break;
                }
                await page.waitForTimeout(100);
            }

            expect(movedTab).not.toBeNull();
            expect(movedTab!.index).toBe(initialIndex + 1);
            expect(movedTab!.id).toBe(initialId);
            if (DEBUG) console.log(`After >>: moved from index ${initialIndex} to ${movedTab!.index}`);
        });
    });

    test('pressing >> twice moves tab two positions to the right', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.bringToFront();
            await page.waitForTimeout(300);

            const allTabs = await getAllTabsInfo();
            const maxIndex = Math.max(...allTabs.map((t) => t.index));

            const initialInfo = await getActiveTabInfo();
            const initialIndex = initialInfo.index;
            const initialId = initialInfo.id;

            // Need at least 2 positions to the right
            expect(maxIndex - initialIndex).toBeGreaterThanOrEqual(2);

            // First >>
            await page.keyboard.press('Shift+Period');
            await page.waitForTimeout(50);
            await page.keyboard.press('Shift+Period');
            await page.waitForTimeout(500);

            let afterFirst: { id: number; index: number } | null = null;
            for (let i = 0; i < 20; i++) {
                const current = await getTabById(initialId);
                if (current && current.index !== initialIndex) {
                    afterFirst = current;
                    break;
                }
                await page.waitForTimeout(100);
            }
            expect(afterFirst).not.toBeNull();
            expect(afterFirst!.index).toBe(initialIndex + 1);

            // Second >>
            await page.keyboard.press('Shift+Period');
            await page.waitForTimeout(50);
            await page.keyboard.press('Shift+Period');
            await page.waitForTimeout(500);

            let afterSecond: { id: number; index: number } | null = null;
            for (let i = 0; i < 20; i++) {
                const current = await getTabById(initialId);
                if (current && current.index !== afterFirst!.index) {
                    afterSecond = current;
                    break;
                }
                await page.waitForTimeout(100);
            }
            expect(afterSecond).not.toBeNull();
            expect(afterSecond!.index).toBe(initialIndex + 2);
            expect(afterSecond!.id).toBe(initialId);
            if (DEBUG) console.log(`After 2x >>: moved from index ${initialIndex} to ${afterSecond!.index}`);
        });
    });
});
