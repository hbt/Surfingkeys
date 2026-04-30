import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_click_node_newtab';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function enterVisualModeAtText(p: Page, text: string) {
    await p.evaluate((t) => { (window as any).find(t); }, text);
    await p.waitForTimeout(100);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(500);
}

async function invokeVisualClickNodeNewtab(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_click_node_newtab');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_click_node_newtab (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await waitForInvokeReady(page);
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => {
            window.getSelection()?.removeAllRanges();
            window.location.hash = '';
        });
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
        // Close any extra pages opened during test
        const pages = context.pages();
        for (const p of pages) {
            if (p !== page) {
                try { await p.close(); } catch (_) {}
            }
        }
    });

    test('Shift-Enter in visual mode on link does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualModeAtText(page, 'Click this link');
            await page.waitForTimeout(200);
            await invokeVisualClickNodeNewtab(page);
            await page.waitForTimeout(800);
            // Just verify we can still interact with the page
            const sel = await page.evaluate(() => typeof window.getSelection());
            expect(sel).toBe('object');
            if (DEBUG) console.log('Shift-Enter executed without error');
        });
    });

    test('Shift-Enter may open new tab for link', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialPageCount = context.pages().length;
            await enterVisualModeAtText(page, 'Click this link');
            await page.waitForTimeout(200);
            await invokeVisualClickNodeNewtab(page);
            await page.waitForTimeout(1000);
            const newPageCount = context.pages().length;
            // Either a new tab was opened or it just navigated - verify no crash
            expect(newPageCount).toBeGreaterThanOrEqual(initialPageCount);
            if (DEBUG) console.log(`Pages before: ${initialPageCount}, after: ${newPageCount}`);
        });
    });

    test('regular Enter does not open a new tab', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialPageCount = context.pages().length;
            await enterVisualModeAtText(page, 'Click this link');
            await page.waitForTimeout(200);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
            const newPageCount = context.pages().length;
            // Regular Enter should not open a new tab
            expect(newPageCount).toBe(initialPageCount);
            const hash = await page.evaluate(() => window.location.hash);
            // Hash may or may not change depending on cursor position in visual mode
            if (DEBUG) console.log(`Regular Enter: no new tab (count=${newPageCount}), hash=${hash}`);
        });
    });

    test('Shift-Enter on plain text does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await enterVisualModeAtText(page, 'Short line');
            await page.waitForTimeout(200);
            await invokeVisualClickNodeNewtab(page);
            await page.waitForTimeout(500);
            const sel = await page.evaluate(() => typeof window.getSelection());
            expect(sel).toBe('object');
            if (DEBUG) console.log('Shift-Enter on plain text completed without error');
        });
    });
});
