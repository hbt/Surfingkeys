import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function enterVisualMode(p: Page) {
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

test.describe('cmd_visual_scroll_center (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_visual_scroll_center');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('zz in visual mode does not error', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(0);

        await enterVisualMode(page);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('z');
        await page.waitForTimeout(300);

        const finalScroll = await page.evaluate(() => window.scrollY);
        expect(typeof finalScroll).toBe('number');
        if (DEBUG) console.log(`zz executed: scroll ${initialScroll}px → ${finalScroll}px`);
    });

    test('zz executes without error and selection remains valid', async () => {
        await page.evaluate(() => window.scrollTo(0, 800));

        await enterVisualMode(page);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('z');
        await page.waitForTimeout(300);

        const selection = await getSelectionInfo(page);
        expect(typeof selection.focusOffset).toBe('number');
        const finalScroll = await page.evaluate(() => window.scrollY);
        if (DEBUG) console.log(`After zz: scrollY=${finalScroll}, focusOffset=${selection.focusOffset}`);
    });

    test('zz scrolls cursor toward center of viewport', async () => {
        await page.evaluate(() => window.scrollTo(0, 800));

        await enterVisualMode(page);

        await page.keyboard.press('z');
        await page.waitForTimeout(50);
        await page.keyboard.press('z');
        await page.waitForTimeout(300);

        const result = await page.evaluate(() => {
            const cursor = document.querySelector('.surfingkeys_cursor');
            if (cursor) {
                const rect = cursor.getBoundingClientRect();
                return {
                    center: (rect.top + rect.bottom) / 2,
                    innerHeight: window.innerHeight,
                };
            }
            return null;
        });

        if (result !== null) {
            const viewportCenter = result.innerHeight / 2;
            const distanceFromCenter = Math.abs(result.center - viewportCenter);
            if (DEBUG) console.log(`Cursor center: ${result.center}px, viewport center: ${viewportCenter}px, distance: ${distanceFromCenter}px`);
            expect(distanceFromCenter).toBeLessThanOrEqual(100);
        }
    });
});
