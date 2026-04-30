import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_nav_open_detected_link';
const FIXTURE_URL = `${FIXTURE_BASE}/detected-links-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_nav_open_detected_link (Playwright)', () => {
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

    test.afterEach(async () => {
        // Dismiss hints overlay with Escape
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
        } catch (_) { /* ignore */ }
    });

    test('pressing O creates hints for detected URLs in page text', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Press 'O' to trigger detected links mode
            await page.keyboard.press('O');

            // Wait for hints to render
            await page.waitForTimeout(1500);

            // Check if hints host was created
            const hintsHostExists = await page.evaluate(() => {
                return document.querySelector('.surfingkeys_hints_host') !== null;
            });
            expect(hintsHostExists).toBe(true);

            // Check shadow DOM for hint label divs (single/double uppercase letters like "A", "SA", etc.)
            const hintsInfo = await page.evaluate(() => {
                try {
                    const host = document.querySelector('.surfingkeys_hints_host') as any;
                    if (!host?.shadowRoot) return { exists: false, hasHolder: false, count: 0 };

                    const holder = host.shadowRoot.querySelector('[mode="text"]') ||
                                   host.shadowRoot.querySelector('[mode]');
                    if (!holder) return { exists: true, hasHolder: false, count: 0 };

                    const allDivs = Array.from(holder.querySelectorAll('div')) as HTMLDivElement[];
                    // Hint labels are short uppercase strings (A, B, SA, SB, etc.)
                    const hintLabels = allDivs.filter((div) =>
                        /^[A-Z]{1,3}$/.test((div.textContent || '').trim())
                    );

                    return {
                        exists: true,
                        hasHolder: true,
                        count: hintLabels.length,
                        labels: hintLabels.map((d) => d.textContent?.trim()),
                    };
                } catch (e: any) {
                    return { error: e.message, exists: false, hasHolder: false, count: 0 };
                }
            });

            if (DEBUG) console.log(`Hints info: ${JSON.stringify(hintsInfo)}`);

            expect(hintsInfo.exists).toBe(true);
            expect(hintsInfo.hasHolder).toBe(true);
            expect(hintsInfo.count).toBeGreaterThan(0);

            if (DEBUG) console.log(`Detected ${hintsInfo.count} URL hints with labels: ${(hintsInfo as any).labels?.join(', ')}`);
        });
    });
});
