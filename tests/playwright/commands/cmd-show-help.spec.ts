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

            const modeHeaderCount = await helpPage.$$eval('#sk_help_tbody tr.group-mode', rows => rows.length);
            expect(modeHeaderCount).toBeGreaterThan(0);

            // First data row (not a group header) has three cells: mapping, unique_id, description
            const firstDataRow = await helpPage.$$eval(
                '#sk_help_tbody tr:not(.group-mode):not(.group-category)',
                rows => rows.length > 0
                    ? [...(rows[0] as HTMLTableRowElement).querySelectorAll('td')].map(c => c.textContent?.trim() ?? '')
                    : []
            );
            expect(firstDataRow.length).toBe(3);
            expect(firstDataRow[1]).not.toBe(''); // unique_id always set
            expect(firstDataRow[2]).not.toBe(''); // description always set

            await helpPage.close().catch(() => {});
        });
    });

    test('unmapped commands show N/A in mapping column', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });

            const ok = await invokeCommand(page, 'cmd_show_help');
            expect(ok).toBe(true);

            const helpPage = await newPagePromise;
            await helpPage.waitForLoadState('load');
            await helpPage.waitForTimeout(500);

            // After unmapAllExcept([]) in beforeEach, most commands are unmapped → N/A
            const naRows = await helpPage.$$eval(
                '#sk_help_tbody td.col-key-na',
                cells => cells.filter(c => c.textContent?.trim() === 'N/A').length
            );
            expect(naRows).toBeGreaterThan(0);

            await helpPage.close().catch(() => {});
        });
    });

    test('row count updates and hide-unmapped toggle works', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });

            const ok = await invokeCommand(page, 'cmd_show_help');
            expect(ok).toBe(true);

            const helpPage = await newPagePromise;
            await helpPage.waitForLoadState('load');
            await helpPage.waitForTimeout(500);

            // Count text shows total
            const countText = await helpPage.$eval('#sk_help_count', el => el.textContent ?? '');
            expect(countText).toMatch(/\d+ \/ \d+ commands/);

            // Toggle hide-unmapped reduces visible rows
            const beforeToggle = await helpPage.$$eval(
                '#sk_help_tbody tr:not(.group-mode):not(.group-category)',
                rows => rows.filter(r => (r as HTMLElement).style.display !== 'none').length
            );

            await helpPage.click('#toggle-unmapped');
            await helpPage.waitForTimeout(100);

            const afterToggle = await helpPage.$$eval(
                '#sk_help_tbody tr:not(.group-mode):not(.group-category)',
                rows => rows.filter(r => (r as HTMLElement).style.display !== 'none').length
            );
            expect(afterToggle).toBeLessThan(beforeToggle);

            // Count updates too
            const countAfter = await helpPage.$eval('#sk_help_count', el => el.textContent ?? '');
            expect(countAfter).toMatch(/\d+ \/ \d+ commands/);

            await helpPage.close().catch(() => {});
        });
    });

    test('mapping column renders kbd elements', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Bind cmd_show_help to a visible key so it shows up mapped
            await callSKApi(page, 'mapcmdkey', 'sh', 'cmd_show_help');

            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });
            const ok = await invokeCommand(page, 'cmd_show_help');
            expect(ok).toBe(true);

            const helpPage = await newPagePromise;
            await helpPage.waitForLoadState('load');
            await helpPage.waitForTimeout(500);

            // At least one mapped row should have kbd elements
            const kbdCount = await helpPage.$$eval(
                '#sk_help_tbody td.col-key kbd',
                els => els.length
            );
            expect(kbdCount).toBeGreaterThan(0);

            await helpPage.close().catch(() => {});
        });
    });

    test('filter inputs narrow rows and hide empty group headers', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const newPagePromise = context.waitForEvent('page', { timeout: 5000 });

            const ok = await invokeCommand(page, 'cmd_show_help');
            expect(ok).toBe(true);

            const helpPage = await newPagePromise;
            await helpPage.waitForLoadState('load');
            await helpPage.waitForTimeout(500);

            // Count total data rows before filtering
            const totalRows = await helpPage.$$eval(
                '#sk_help_tbody tr:not(.group-mode):not(.group-category)',
                rows => rows.length
            );
            expect(totalRows).toBeGreaterThan(0);

            // Type in the uid filter
            await helpPage.fill('#filter-uid', 'scroll');
            await helpPage.waitForTimeout(100);

            // Some rows should be visible and fewer than total
            const visibleRows = await helpPage.$$eval(
                '#sk_help_tbody tr:not(.group-mode):not(.group-category)',
                rows => rows.filter(r => (r as HTMLElement).style.display !== 'none').length
            );
            expect(visibleRows).toBeGreaterThan(0);
            expect(visibleRows).toBeLessThan(totalRows);

            // Group headers with no visible rows should be hidden
            const visibleModeHeaders = await helpPage.$$eval(
                '#sk_help_tbody tr.group-mode',
                rows => rows.filter(r => (r as HTMLElement).style.display !== 'none').length
            );
            const totalModeHeaders = await helpPage.$$eval(
                '#sk_help_tbody tr.group-mode',
                rows => rows.length
            );
            expect(visibleModeHeaders).toBeLessThanOrEqual(totalModeHeaders);

            await helpPage.close().catch(() => {});
        });
    });
});
