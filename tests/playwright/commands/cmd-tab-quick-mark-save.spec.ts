import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_tab_quick_mark_save';
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

test.describe('cmd_tab_quick_mark_save (Playwright)', () => {
    let pages: Page[] = [];
    let ids: number[] = [];

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;

        for (let i = 0; i < 2; i++) {
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
        }
    });

    test('save mark completes without error', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await pages[0].bringToFront();
                await pages[0].waitForTimeout(200);
                // Press save key then mark letter — should not throw
                await pages[0].keyboard.press('q');
                await pages[0].waitForTimeout(100);
                await pages[0].keyboard.press('a');
                await pages[0].waitForTimeout(300);
                // Verify no crash — active tab is still pages[0]
                const activeId = await getActiveTabId();
                expect(activeId).toBe(ids[0]);
            }
        );
    });

    test('saved mark can be retrieved via jump command', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Save mark 'b' on pages[0]
                await pages[0].bringToFront();
                await pages[0].waitForTimeout(200);
                await callSKApi(pages[0], 'unmapAllExcept', []);
                await callSKApi(pages[0], 'mapcmdkey', 'q', 'cmd_tab_quick_mark_save');
                await callSKApi(pages[0], 'mapcmdkey', 'w', 'cmd_tab_quick_mark_jump');
                await pages[0].keyboard.press('q');
                await pages[0].waitForTimeout(100);
                await pages[0].keyboard.press('b');
                await pages[0].waitForTimeout(300);

                // Switch to pages[1]
                await pages[1].bringToFront();
                await pages[1].waitForTimeout(300);
                await callSKApi(pages[1], 'unmapAllExcept', []);
                await callSKApi(pages[1], 'mapcmdkey', 'w', 'cmd_tab_quick_mark_jump');
                const beforeId = await getActiveTabId();
                expect(beforeId).toBe(ids[1]);

                // Jump to mark 'b' — should go to pages[0]
                await pages[1].keyboard.press('w');
                await pages[1].waitForTimeout(100);
                await pages[1].keyboard.press('b');

                // Poll for tab change
                const deadline = Date.now() + 3000;
                let afterId = beforeId;
                while (Date.now() < deadline) {
                    afterId = await getActiveTabId();
                    if (afterId !== beforeId) break;
                    await new Promise(r => setTimeout(r, 100));
                }
                expect(afterId).toBe(ids[0]);
            }
        );
    });
});
