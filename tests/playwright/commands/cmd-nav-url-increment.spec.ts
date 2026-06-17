import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_nav_url_increment';
const INC_ID = 'cmd_nav_url_increment';
const DEC_ID = 'cmd_nav_url_decrement';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_nav_url_increment (Playwright)', () => {
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
        await callSKApi(page, 'mapcmdkey', '=', INC_ID);
        await callSKApi(page, 'mapcmdkey', '-', DEC_ID);
    });

    test('increments the last number in the URL by 1', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.goto(`${FIXTURE_URL}?id=100`, { waitUntil: 'load' });
                await page.waitForTimeout(500);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', '=', INC_ID);

                const nav = page.waitForURL(/id=101/, { timeout: 5000 });
                await page.keyboard.press('=');
                await nav;

                const url = page.url();
                expect(url).toContain('id=101');
                if (DEBUG) console.log(`Increment: ${url}`);
            }
        );
    });

    test('decrements the last number in the URL by 1', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.goto(`${FIXTURE_URL}?id=100`, { waitUntil: 'load' });
                await page.waitForTimeout(500);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', '-', DEC_ID);

                const nav = page.waitForURL(/id=99/, { timeout: 5000 });
                await page.keyboard.press('-');
                await nav;

                const url = page.url();
                expect(url).toContain('id=99');
                if (DEBUG) console.log(`Decrement: ${url}`);
            }
        );
    });

    test('2= increments the last number by 2', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.goto(`${FIXTURE_URL}?id=100`, { waitUntil: 'load' });
                await page.waitForTimeout(500);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', '=', INC_ID);

                const nav = page.waitForURL(/id=102/, { timeout: 5000 });
                await page.keyboard.press('2');
                await page.keyboard.press('=');
                await nav;

                expect(page.url()).toContain('id=102');
                if (DEBUG) console.log(`2= increment: ${page.url()}`);
            }
        );
    });

    test('increments the number in a HN-style URL', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Simulate HN-style ?id=48565130 — rightmost number increments
                await page.goto(`${FIXTURE_URL}?id=48565130`, { waitUntil: 'load' });
                await page.waitForTimeout(500);
                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', '=', INC_ID);

                const nav = page.waitForURL(/id=48565131/, { timeout: 5000 });
                await page.keyboard.press('=');
                await nav;

                expect(page.url()).toContain('id=48565131');
                if (DEBUG) console.log(`HN-style increment: ${page.url()}`);
            }
        );
    });
});
