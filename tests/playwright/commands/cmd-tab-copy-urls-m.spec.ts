import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_copy_urls_m';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'gY';
const UNIQUE_ID = 'cmd_tab_copy_urls_m';

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function callSKApi(p: Page, fn: string, ...args: unknown[]) {
    await p.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await p.waitForTimeout(100);
}

async function setConf(p: Page, key: string, value: unknown) {
    await p.evaluate(([k, v]) => {
        document.dispatchEvent(new CustomEvent('__sk_conf_override', {
            detail: { key: k, value: v }
        }));
    }, [key, value] as [string, unknown]);
    await p.waitForTimeout(50);
}

async function getClipboardText(p: Page): Promise<string> {
    return p.evaluate(() => navigator.clipboard.readText());
}

test.describe('cmd_tab_copy_urls_m (pending-key, Playwright)', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
        await setConf(page, 'magicKeys', { 't': 'CurrentTab', 'a': 'AllInWindow' });
    });

    test('gYt copies current tab URL to clipboard', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await page.bringToFront();
                await page.waitForTimeout(200);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await page.keyboard.press('g');
                await page.waitForTimeout(50);
                await page.keyboard.press('Y');
                await page.waitForTimeout(50);
                await page.keyboard.press('t');
                await page.waitForTimeout(500);

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('scroll-test.html');
                if (DEBUG) console.log(`gYt: clipboard=${clip}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gYt/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gYt/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('gYa copies all tab URLs in window to clipboard', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Open an additional tab so we have at least 2
                const extra = await context.newPage();
                await extra.goto(`${FIXTURE_URL}#extra`, { waitUntil: 'load' });
                await extra.waitForTimeout(200);

                await page.bringToFront();
                await page.waitForTimeout(300);
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(page, 'magicKeys', { 'a': 'AllInWindow' });

                await page.keyboard.press('g');
                await page.waitForTimeout(50);
                await page.keyboard.press('Y');
                await page.waitForTimeout(50);
                await page.keyboard.press('a');
                await page.waitForTimeout(500);

                const clip = await getClipboardText(page).catch(() => '');
                expect(clip).toContain('scroll-test.html');
                // AllInWindow should include both tabs
                expect(clip.split('\n').length).toBeGreaterThanOrEqual(2);
                if (DEBUG) console.log(`gYa: clipboard lines=${clip.split('\n').length}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/gYa/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/gYa/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
                await extra.close().catch(() => {});
            },
        );
    });
});
