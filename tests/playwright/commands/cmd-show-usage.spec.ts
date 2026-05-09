import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_show_usage';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_show_usage (Playwright)', () => {
    test.setTimeout(30_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(200);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_show_usage is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            const ok = await invokeCommand(page, 'cmd_show_usage');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);
        });
    });

    test('cmd_show_usage shows usage popup in frontend frame', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, 'cmd_show_usage');
            await page.waitForTimeout(500);

            const frontendFrame = page.frames().find(f => f.url().includes('frontend.html'));
            expect(frontendFrame).toBeDefined();

            // Usage panel shows in sk_usage element or similar popup area
            const usageVisible = await frontendFrame!.evaluate(() => {
                const usage = document.querySelector('#sk_usage') as HTMLElement | null;
                const popup = document.querySelector('#sk_popup') as HTMLElement | null;
                const bubbles = document.querySelector('#sk_bubbles') as HTMLElement | null;
                return (
                    (usage && usage.style.display !== 'none') ||
                    (popup && popup.style.display !== 'none') ||
                    (bubbles && bubbles.style.display !== 'none')
                );
            });

            if (DEBUG) console.log(`usageVisible: ${usageVisible}`);
            expect(usageVisible).toBe(true);
        });
    });
});
