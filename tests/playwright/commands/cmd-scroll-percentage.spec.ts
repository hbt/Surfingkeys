import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_percentage';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

/**
 * Send the '%' key via CDP (Shift+5 as a special character).
 * Playwright's keyboard.press('Shift+5') does not trigger SK's % handler
 * because SK processes keydown events with key='%' but Playwright sends key='5'
 * with shiftKey=true. This helper replicates the exact CDP approach used in
 * the CDP test suite.
 */
async function sendPercentKey(p: Page): Promise<void> {
    const session = await p.context().newCDPSession(p);
    try {
        await session.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: '%',
            code: 'Digit5',
            windowsVirtualKeyCode: 53,
            modifiers: 8, // Shift
        } as any);
        await new Promise(r => setTimeout(r, 50));
        await session.send('Input.dispatchKeyEvent', {
            type: 'char',
            text: '%',
            code: 'Digit5',
            windowsVirtualKeyCode: 53,
            modifiers: 8,
        } as any);
        await new Promise(r => setTimeout(r, 50));
        await session.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: '%',
            code: 'Digit5',
            windowsVirtualKeyCode: 53,
            modifiers: 8,
        } as any);
    } finally {
        await session.detach();
    }
}

test.describe('cmd_scroll_percentage (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        // Scroll back to top before each test
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
    });

    test('pressing 1% from bottom scrolls to top area', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.keyboard.press('G');
            await page.waitForFunction(() => window.scrollY > 100, { timeout: 5000 });
            await page.waitForTimeout(300);

            const scrollAtBottom = await page.evaluate(() => window.scrollY);
            expect(scrollAtBottom).toBeGreaterThan(100);
            if (DEBUG) console.log('After G (bottom):', scrollAtBottom);

            await page.keyboard.press('1');
            await page.waitForTimeout(100);
            await sendPercentKey(page);
            await page.waitForTimeout(1500);

            const finalScroll = await page.evaluate(() => window.scrollY);
            if (DEBUG) console.log('After 1%:', finalScroll, '(expected near 0)');
            expect(finalScroll).toBeLessThan(scrollAtBottom);
        });
    });

    test('pressing 5% positions scroll at 5% of page height', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            const clientHeight = await page.evaluate(() => document.documentElement.clientHeight);

            await page.evaluate(() => window.scrollTo(0, 1000));
            await page.waitForTimeout(200);

            await page.keyboard.press('5');
            await page.waitForTimeout(100);
            await sendPercentKey(page);
            await page.waitForTimeout(1500);

            const finalScroll = await page.evaluate(() => window.scrollY);
            const expectedTarget = Math.max(0, Math.floor(5 * scrollHeight / 100) - Math.floor(clientHeight / 2));
            if (DEBUG) console.log(`After 5%: scrollY=${finalScroll}, expected=${expectedTarget}, scrollHeight=${scrollHeight}`);
            expect(Math.abs(finalScroll - expectedTarget)).toBeLessThan(20);
        });
    });

    test('% command without repeat scrolls to 1% position (default repeat=1)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 1200));
            await page.waitForTimeout(200);

            const scrollBefore = await page.evaluate(() => window.scrollY);
            expect(scrollBefore).toBeGreaterThan(100);

            await sendPercentKey(page);
            await page.waitForTimeout(1500);

            const finalScroll = await page.evaluate(() => window.scrollY);
            const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            const clientHeight = await page.evaluate(() => document.documentElement.clientHeight);
            const expectedTarget = Math.max(0, Math.floor(1 * scrollHeight / 100) - Math.floor(clientHeight / 2));

            if (DEBUG) console.log(`After bare %: scrollY=${finalScroll}, expected=${expectedTarget}`);
            expect(Math.abs(finalScroll - expectedTarget)).toBeLessThan(20);
        });
    });
});
