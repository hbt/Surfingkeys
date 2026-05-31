import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const SUITE_LABEL = 'cmd_show_help';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_show_help (Playwright)', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'sh', 'cmd_show_help');

        // Close any extra pages from previous tests
        const pages = context.pages();
        for (const p of pages) {
            if (p !== page) {
                await p.close().catch(() => {});
            }
        }
        if (page.isClosed()) {
            page = await context.newPage();
            await page.goto(FIXTURE_URL, { waitUntil: 'load' });
            await page.waitForTimeout(500);
        } else {
            await page.bringToFront();
        }
    });

    test('cmd_show_help opens help.html in new tab with command table', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });

            const ok = await invokeCommand(page, 'cmd_show_help');
            expect(ok).toBe(true);

            const helpPage = await newPagePromise;
            await helpPage.waitForLoadState('load');
            await helpPage.waitForTimeout(500);

            expect(helpPage.url()).toContain('help.html');

            const table = await helpPage.$('#sk_help_table');
            expect(table).not.toBeNull();

            const rowCount = await helpPage.$$eval('#sk_help_tbody tr', rows => rows.length);
            expect(rowCount).toBeGreaterThan(0);

            // First row has three cells: mapping, unique_id, description
            const firstRow = await helpPage.$$eval('#sk_help_tbody tr:first-child td', cells => cells.map(c => c.textContent?.trim() ?? ''));
            expect(firstRow.length).toBe(3);
            expect(firstRow[1]).not.toBe(''); // unique_id always set
            expect(firstRow[2]).not.toBe(''); // description always set

            await helpPage.close().catch(() => {});
        });
    });
});
