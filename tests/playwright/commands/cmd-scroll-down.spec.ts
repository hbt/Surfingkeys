import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats, withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_scroll_down';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_scroll_down (Playwright)', () => {
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
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test('pressing j key scrolls page down', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const initialScroll = await page.evaluate(() => window.scrollY);
            expect(initialScroll).toBe(0);

            const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });

            expect(result.final).toBeGreaterThan(result.baseline);
            if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
        });
    });

    test('scroll down distance is consistent', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const result1 = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
            const result2 = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });

            if (DEBUG) console.log(`1st: ${result1.delta}px, 2nd: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);
            expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(15);
        });
    });

    test('pressing 5j scrolls 5 times the distance of j', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const result1 = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
            const singleDistance = result1.delta;

            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(100);

            const scrollPromise = page.evaluate(
                ({ minDelta, timeoutMs }) => {
                    return new Promise<{ baseline: number; final: number }>((resolve) => {
                        const baseline = window.scrollY;
                        let resolved = false;
                        const listener = () => {
                            if (resolved) return;
                            const current = window.scrollY;
                            if (current - baseline >= minDelta) {
                                resolved = true;
                                window.removeEventListener('scroll', listener);
                                resolve({ baseline, final: current });
                            }
                        };
                        window.addEventListener('scroll', listener);
                        setTimeout(() => {
                            if (!resolved) {
                                resolved = true;
                                window.removeEventListener('scroll', listener);
                                resolve({ baseline, final: window.scrollY });
                            }
                        }, timeoutMs);
                    });
                },
                { minDelta: singleDistance * 3, timeoutMs: 5000 },
            );

            await page.keyboard.press('5');
            await page.keyboard.press('j');

            const { baseline, final } = await scrollPromise;
            const repeatDistance = final - baseline;
            const ratio = repeatDistance / singleDistance;

            if (DEBUG) console.log(`Single j: ${singleDistance}px, 5j: ${repeatDistance}px (ratio: ${ratio.toFixed(2)}x)`);
            expect(ratio).toBeGreaterThanOrEqual(3.5);
            expect(ratio).toBeLessThanOrEqual(6.5);
        });
    });
});
