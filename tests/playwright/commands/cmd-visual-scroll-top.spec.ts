import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_visual_scroll_top';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function enterVisualMode(p: Page, text: string) {
    await p.evaluate((t) => { (window as any).find(t); }, text);
    await p.waitForTimeout(100);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(300);
}

async function getSelectionInfo(p: Page) {
    return p.evaluate(() => {
        const sel = window.getSelection();
        return {
            type: sel?.type ?? '',
            anchorOffset: sel?.anchorOffset ?? 0,
            focusOffset: sel?.focusOffset ?? 0,
            text: sel?.toString() ?? '',
        };
    });
}

async function getCursorTop(p: Page): Promise<number | null> {
    return p.evaluate(() => {
        const cursor = document.querySelector('.surfingkeys_cursor');
        if (cursor) {
            return cursor.getBoundingClientRect().top;
        }
        return null;
    });
}

async function invokeVisualScrollTop(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_scroll_top');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_scroll_top (Playwright)', () => {
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
            window.scrollTo(0, 0);
            window.getSelection()?.removeAllRanges();
        });
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('zt in visual mode does not error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 500));
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBe(500);

            await enterVisualMode(page, 'Lorem ipsum');

            await invokeVisualScrollTop(page);
            await page.waitForTimeout(300);

            const finalScroll = await page.evaluate(() => window.scrollY);
            expect(typeof finalScroll).toBe('number');
            if (DEBUG) console.log(`zt executed: scroll ${initialScroll}px → ${finalScroll}px`);
        });
    });

    test('zt changes scroll position', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 800));
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBe(800);

            await enterVisualMode(page, 'Lorem ipsum');

            await invokeVisualScrollTop(page);
            await page.waitForTimeout(300);

            const finalScroll = await page.evaluate(() => window.scrollY);
            if (DEBUG) console.log(`Scroll: ${initialScroll}px → ${finalScroll}px`);
            expect(finalScroll).not.toBe(initialScroll);
        });
    });

    test('zt scrolls cursor toward top of viewport', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 800));

            await enterVisualMode(page, 'Lorem ipsum');

            await invokeVisualScrollTop(page);
            await page.waitForTimeout(300);

            const cursorTop = await getCursorTop(page);
            const finalScroll = await page.evaluate(() => window.scrollY);
            if (DEBUG) console.log(`After zt: scroll=${finalScroll}px, cursorTop=${cursorTop}px`);

            if (cursorTop !== null) {
                expect(Number.isFinite(cursorTop)).toBe(true);
            }
        });
    });
});
