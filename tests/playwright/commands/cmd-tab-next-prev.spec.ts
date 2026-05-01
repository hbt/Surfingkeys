/**
 * Playwright Test: cmd_tab_next + cmd_tab_previous
 *
 * Combined test for R (next tab) and E (prev tab) commands.
 * Setup: 5 tabs, start at the middle (index 2). Navigate with R/E
 * and verify which tab became active via chrome.tabs.query.
 *
 * Key design decisions:
 * - Each fixture tab uses a unique URL (?tab=N) so getChromeTabId is unambiguous
 * - chrome.tabs.query is called via the extension options page (has chrome.tabs access)
 * - Key presses are always sent to the currently-active Playwright Page
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-tab-next-prev.spec.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const FIXTURE_BASE = 'http://127.0.0.1:9873/scroll-test.html';
const SUITE_LABEL = 'cmd_tab_next_prev';
const CONTENT_COVERAGE_URL = `${FIXTURE_BASE}?tab=0`;
const TAB_COUNT = 5;
const START_INDEX = 2; // middle tab — 2 tabs left, 2 tabs right

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;
let queryPage: Page;       // extension options page for chrome.tabs access
let fixtureTabs: Page[];   // Playwright pages in creation order
// Maps chrome tab id → Playwright Page (built after setup)
let chromeIdToPage: Map<number, Page>;

// ---------------------------------------------------------------------------
// chrome.tabs helpers via extension options page
// ---------------------------------------------------------------------------

async function queryChromeTabs(queryObj: object = { currentWindow: true }) {
    return queryPage.evaluate(
        (q) => new Promise<any[]>(r => chrome.tabs.query(q as any, r)),
        queryObj,
    );
}

async function getActiveTab(): Promise<{ id: number; index: number; url: string }> {
    const tabs = await queryChromeTabs({ active: true, currentWindow: true });
    return tabs[0];
}

async function activateChromeTab(tabId: number) {
    await queryPage.evaluate(
        (id) => new Promise<void>(r => chrome.tabs.update(id, { active: true }, () => r())),
        tabId,
    );
}

async function getChromeTabIdForPage(page: Page): Promise<number> {
    const url = page.url(); // unique per tab because of ?tab=N suffix
    const tabs = await queryChromeTabs({ currentWindow: true });
    const match = tabs.find(t => t.url === url);
    if (!match) throw new Error(`No chrome tab found for url=${url}`);
    return match.id;
}

/** Build/refresh the chromeId → Playwright Page mapping. */
async function buildChromeIdMap() {
    chromeIdToPage = new Map();
    for (const p of fixtureTabs) {
        const id = await getChromeTabIdForPage(p);
        chromeIdToPage.set(id, p);
    }
}

/** Get the Playwright Page that is currently active in Chrome. */
async function getActivePage(): Promise<Page> {
    const active = await getActiveTab();
    const p = chromeIdToPage.get(active.id);
    if (!p) throw new Error(`No Playwright page mapped for chrome tab id=${active.id}`);
    return p;
}

/** Activate a fixture tab by its array index. */
async function activateFixtureTab(index: number) {
    const tabId = await getChromeTabIdForPage(fixtureTabs[index]);
    await activateChromeTab(tabId);
    await new Promise(r => setTimeout(r, 300));
}

/** Poll until the active tab id changes, return new active tab info. */
async function waitForTabSwitch(
    previousId: number,
    timeoutMs = 3000,
): Promise<{ id: number; index: number; url: string }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const current = await getActiveTab();
        if (current && current.id !== previousId) return current;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Tab did not switch from id=${previousId} within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_tab_next + cmd_tab_previous (Playwright)', () => {
    test.setTimeout(60_000);

    let startChromeTabId: number;

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;

        // Close the initial blank page Chrome opens so our tab indices are clean.
        const initialPages = context.pages();
        for (const p of initialPages) {
            await p.close();
        }

        // Open extension options page as chrome.tabs query surface.
        const sw = context.serviceWorkers()[0]
            ?? await context.waitForEvent('serviceworker');
        const extensionId = new URL(sw.url()).hostname;
        queryPage = await context.newPage();
        await queryPage.goto(
            `chrome-extension://${extensionId}/pages/options.html`,
            { waitUntil: 'domcontentloaded' },
        );

        // Open 5 fixture tabs with unique ?tab=N URLs for unambiguous identification.
        fixtureTabs = [];
        for (let i = 0; i < TAB_COUNT; i++) {
            const p = await context.newPage();
            await p.goto(`${FIXTURE_BASE}?tab=${i}`, { waitUntil: 'load' });
            fixtureTabs.push(p);
            await p.waitForTimeout(200);
        }

        // Build the chrome id ↔ Playwright page mapping.
        await buildChromeIdMap();

        // Activate the middle fixture tab as the canonical start.
        await activateFixtureTab(START_INDEX);
        startChromeTabId = await getChromeTabIdForPage(fixtureTabs[START_INDEX]);

        // Let Surfingkeys settle in the active tab.
        await fixtureTabs[START_INDEX].waitForTimeout(500);

    });

    test.beforeEach(async () => {
        // Reset to middle tab before each test.
        await activateChromeTab(startChromeTabId);
        await new Promise(r => setTimeout(r, 300));
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    // -----------------------------------------------------------------------
    // 1.0 Setup verification
    // -----------------------------------------------------------------------

    test('1.1 should have 5 fixture tabs + 1 query page open', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            expect(fixtureTabs.length).toBe(TAB_COUNT);
            // queryPage (options.html) + 5 fixture tabs
            expect(context.pages().length).toBe(TAB_COUNT + 1);
        });
    });

    test('1.2 should start at the middle fixture tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const active = await getActiveTab();
            expect(active.id).toBe(startChromeTabId);
        });
    });

    test('1.3 all fixture tabs should be at unique URLs', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const urls = fixtureTabs.map(p => p.url());
            const uniqueUrls = new Set(urls);
            expect(uniqueUrls.size).toBe(TAB_COUNT);
            for (let i = 0; i < TAB_COUNT; i++) {
                expect(urls[i]).toContain(`?tab=${i}`);
            }
        });
    });

    // -----------------------------------------------------------------------
    // 2.0 R — next tab
    // -----------------------------------------------------------------------

    test('2.1 pressing R switches to next tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialTab = await getActiveTab();
            const activePage = await getActivePage();

            await activePage.keyboard.press('R');
            const newTab = await waitForTabSwitch(initialTab.id);

            expect(newTab.index).toBe(initialTab.index + 1);
            expect(newTab.id).not.toBe(initialTab.id);
        });
    });

    test('2.2 pressing R twice switches two tabs to the right', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialTab = await getActiveTab();

            // First R
            let activePage = await getActivePage();
            await activePage.keyboard.press('R');
            const afterFirst = await waitForTabSwitch(initialTab.id);
            expect(afterFirst.index).toBe(initialTab.index + 1);

            // Second R — send to the now-active page
            activePage = chromeIdToPage.get(afterFirst.id)!;
            await activePage.keyboard.press('R');
            const afterSecond = await waitForTabSwitch(afterFirst.id);
            expect(afterSecond.index).toBe(initialTab.index + 2);
        });
    });

    test('2.3 pressing 2R jumps 2 tabs to the right', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialTab = await getActiveTab();
            const activePage = await getActivePage();

            await activePage.keyboard.press('2');
            await activePage.keyboard.press('R');

            const finalTab = await waitForTabSwitch(initialTab.id);
            expect(finalTab.index).toBe(initialTab.index + 2);
        });
    });

    test('2.4 R wraps from last fixture tab back toward first', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Activate the last fixture tab
            await activateFixtureTab(TAB_COUNT - 1);
            const initialTab = await getActiveTab();
            const activePage = chromeIdToPage.get(initialTab.id)!;

            await activePage.keyboard.press('R');
            const newTab = await waitForTabSwitch(initialTab.id);

            // After wrap, should no longer be at the last tab
            expect(newTab.id).not.toBe(initialTab.id);
        });
    });

    // -----------------------------------------------------------------------
    // 3.0 E — previous tab
    // -----------------------------------------------------------------------

    test('3.1 pressing E switches to previous tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialTab = await getActiveTab();
            const activePage = await getActivePage();

            await activePage.keyboard.press('E');
            const newTab = await waitForTabSwitch(initialTab.id);

            expect(newTab.index).toBe(initialTab.index - 1);
            expect(newTab.id).not.toBe(initialTab.id);
        });
    });

    test('3.2 pressing E twice switches two tabs to the left', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialTab = await getActiveTab();

            // First E
            let activePage = await getActivePage();
            await activePage.keyboard.press('E');
            const afterFirst = await waitForTabSwitch(initialTab.id);
            expect(afterFirst.index).toBe(initialTab.index - 1);

            // Second E — send to now-active page
            activePage = chromeIdToPage.get(afterFirst.id)!;
            await activePage.keyboard.press('E');
            const afterSecond = await waitForTabSwitch(afterFirst.id);
            expect(afterSecond.index).toBe(initialTab.index - 2);
        });
    });

    test('3.3 pressing 2E jumps 2 tabs to the left', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialTab = await getActiveTab();
            const activePage = await getActivePage();

            await activePage.keyboard.press('2');
            await activePage.keyboard.press('E');

            const finalTab = await waitForTabSwitch(initialTab.id);
            expect(finalTab.index).toBe(initialTab.index - 2);
        });
    });

    test('3.4 E wraps from first fixture tab toward last', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await activateFixtureTab(0);
            const initialTab = await getActiveTab();
            const activePage = chromeIdToPage.get(initialTab.id)!;

            await activePage.keyboard.press('E');
            const newTab = await waitForTabSwitch(initialTab.id);

            expect(newTab.id).not.toBe(initialTab.id);
        });
    });

    // -----------------------------------------------------------------------
    // 4.0 Combined R + E navigation
    // -----------------------------------------------------------------------

    test('4.1 R then E returns to the original tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialTab = await getActiveTab();

            let activePage = await getActivePage();
            await activePage.keyboard.press('R');
            const afterR = await waitForTabSwitch(initialTab.id);
            expect(afterR.index).toBe(initialTab.index + 1);

            activePage = chromeIdToPage.get(afterR.id)!;
            await activePage.keyboard.press('E');
            const afterE = await waitForTabSwitch(afterR.id);
            expect(afterE.id).toBe(initialTab.id);
        });
    });

    test('4.2 R right twice, E left twice returns to start', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialTab = await getActiveTab();
            const initialIndex = initialTab.index;

            // Go right twice
            let activePage = await getActivePage();
            await activePage.keyboard.press('R');
            const step1 = await waitForTabSwitch(initialTab.id);
            expect(step1.index).toBe(initialIndex + 1);

            activePage = chromeIdToPage.get(step1.id)!;
            await activePage.keyboard.press('R');
            const step2 = await waitForTabSwitch(step1.id);
            expect(step2.index).toBe(initialIndex + 2);

            // Come back left twice
            activePage = chromeIdToPage.get(step2.id)!;
            await activePage.keyboard.press('E');
            const step3 = await waitForTabSwitch(step2.id);
            expect(step3.index).toBe(initialIndex + 1);

            activePage = chromeIdToPage.get(step3.id)!;
            await activePage.keyboard.press('E');
            const step4 = await waitForTabSwitch(step3.id);
            expect(step4.id).toBe(initialTab.id);
        });
    });

    test('4.3 2R then 2E returns to start', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialTab = await getActiveTab();

            let activePage = await getActivePage();
            await activePage.keyboard.press('2');
            await activePage.keyboard.press('R');
            const afterRight = await waitForTabSwitch(initialTab.id);
            expect(afterRight.index).toBe(initialTab.index + 2);

            activePage = chromeIdToPage.get(afterRight.id)!;
            await activePage.keyboard.press('2');
            await activePage.keyboard.press('E');
            const afterLeft = await waitForTabSwitch(afterRight.id);
            expect(afterLeft.id).toBe(initialTab.id);
        });
    });
});
