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

const SUITE_LABEL = 'cmd_page_linkify';
const FIXTURE_URL = `${FIXTURE_BASE}/linkify-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_page_linkify (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'Ml', 'cmd_page_linkify');
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_page_linkify converts plain-text URLs to anchor tags', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', 'Ml', 'cmd_page_linkify');

                const beforeCount = await page.locator('#plain-url a').count();
                expect(beforeCount).toBe(0);

                await invokeCommand(page, 'cmd_page_linkify');
                await page.waitForTimeout(200);

                const link = page.locator('#plain-url a[href="https://example.com"]');
                await expect(link).toHaveCount(1);
                await expect(link).toHaveText('https://example.com');
            },
        );
    });

    test('cmd_page_linkify handles multiple URLs in one paragraph', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', 'Ml', 'cmd_page_linkify');

                await invokeCommand(page, 'cmd_page_linkify');
                await page.waitForTimeout(200);

                const links = page.locator('#multiple-urls a');
                await expect(links).toHaveCount(2);
            },
        );
    });

    test('cmd_page_linkify does not double-wrap already-linked text', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await page.waitForTimeout(300);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', 'Ml', 'cmd_page_linkify');

                await invokeCommand(page, 'cmd_page_linkify');
                await page.waitForTimeout(200);

                // Should still be exactly 1 link — not nested or duplicated
                const links = page.locator('#already-linked a');
                await expect(links).toHaveCount(1);
            },
        );
    });
});
