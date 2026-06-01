import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_tab_quick_mark_jump';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

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

async function getTabIdForPage(p: Page): Promise<number> {
    await p.bringToFront();
    await p.waitForTimeout(300);
    return getActiveTabId();
}

async function activateTabById(tabId: number): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((id: number) => {
        return new Promise<void>((resolve) => {
            chrome.tabs.update(id, { active: true }, () => resolve());
        });
    }, tabId);
    await new Promise(r => setTimeout(r, 400));
}

async function pollForTabChange(fromTabId: number, maxMs = 3000): Promise<number> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
        const currentId = await getActiveTabId();
        if (currentId !== fromTabId) return currentId;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Tab did not change from ${fromTabId} within ${maxMs}ms`);
}

test.describe('cmd_tab_quick_mark_jump (Playwright)', () => {
    let pages: Page[] = [];
    let ids: number[] = [];

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;

        for (let i = 0; i < 3; i++) {
            const p = await context.newPage();
            await p.goto(FIXTURE_URL, { waitUntil: 'load' });
            await p.waitForTimeout(200);
            pages.push(p);
        }

        for (const p of pages) {
            const id = await getTabIdForPage(p);
            ids.push(id);
        }
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        for (const p of pages) {
            await callSKApi(p, 'unmapAllExcept', []);
            await callSKApi(p, 'mapcmdkey', 'q', 'cmd_tab_quick_mark_save');
            await callSKApi(p, 'mapcmdkey', 'w', 'cmd_tab_quick_mark_jump');
        }
    });

    test('jump to named mark switches to saved tab', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Save mark 'a' on pages[0]
                await pages[0].bringToFront();
                await pages[0].waitForTimeout(200);
                await pages[0].keyboard.press('q');
                await pages[0].waitForTimeout(100);
                await pages[0].keyboard.press('a');
                await pages[0].waitForTimeout(300);

                // Switch to pages[2]
                await activateTabById(ids[2]);
                await pages[2].bringToFront();
                await pages[2].waitForTimeout(200);
                const beforeId = await getActiveTabId();
                expect(beforeId).toBe(ids[2]);

                // Jump to mark 'a' — should go to pages[0]
                await pages[2].keyboard.press('w');
                await pages[2].waitForTimeout(100);
                await pages[2].keyboard.press('a');

                const afterId = await pollForTabChange(beforeId);
                expect(afterId).toBe(ids[0]);
            }
        );
    });

    test('backtick-backtick toggles to last tab', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Bind Ctrl+6 to goToLastTab for reference, but use our jump command with backtick
                for (const p of pages) {
                    await callSKApi(p, 'unmapAllExcept', []);
                    await callSKApi(p, 'mapcmdkey', 'w', 'cmd_tab_quick_mark_jump');
                }

                // Build history: ids[0] -> ids[1] -> ids[2] (current)
                await activateTabById(ids[0]);
                await activateTabById(ids[1]);
                await activateTabById(ids[2]);
                await pages[2].bringToFront();
                await pages[2].waitForTimeout(300);

                const beforeId = await getActiveTabId();
                expect(beforeId).toBe(ids[2]);

                // Press jump key then backtick — delegates to goToLastTab
                await pages[2].keyboard.press('w');
                await pages[2].waitForTimeout(100);
                await pages[2].keyboard.press('`');

                const afterId = await pollForTabChange(beforeId);
                expect(afterId).toBe(ids[1]);
            }
        );
    });

    test('jump to unknown mark does nothing', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await activateTabById(ids[0]);
                await pages[0].bringToFront();
                await pages[0].waitForTimeout(200);
                const beforeId = await getActiveTabId();
                expect(beforeId).toBe(ids[0]);

                // Press jump then 'z' (no mark saved) — tab should not change
                await pages[0].keyboard.press('w');
                await pages[0].waitForTimeout(100);
                await pages[0].keyboard.press('z');
                await pages[0].waitForTimeout(500);

                const afterId = await getActiveTabId();
                expect(afterId).toBe(ids[0]);
            }
        );
    });
});
