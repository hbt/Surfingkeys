import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import { ServiceWorkerCoverage, printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;
const COVERAGE = process.env.COVERAGE === 'true';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let swCoverage: ServiceWorkerCoverage | undefined;

test.describe('cmd_scroll_down (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchExtensionContext({ enableCoverage: COVERAGE });
        context = result.context;

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        if (COVERAGE && result.cdpPort) {
            swCoverage = new ServiceWorkerCoverage();
            // Scroll commands execute in the content script (page context), not the service worker.
            // Connect to the fixture page target so the profiler captures content-script execution.
            const ok = await swCoverage.init(
                result.cdpPort,
                (t) => t.type === 'page' && t.url?.includes('scroll-test.html'),
            );
            if (!ok) swCoverage = undefined;
        }
    });

    test.afterAll(async () => {
        await swCoverage?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test('pressing j key scrolls page down', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(0);

        await swCoverage?.snapshot();                                              // baseline BEFORE
        const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        if (swCoverage) printCoverageDelta(await swCoverage.delta(), 'cmd_scroll_down'); // delta AFTER

        expect(result.final).toBeGreaterThan(result.baseline);
        if (DEBUG) console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);
    });

    test('scroll down distance is consistent', async () => {
        await swCoverage?.snapshot();
        const result1 = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        const result2 = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        if (swCoverage) printCoverageDelta(await swCoverage.delta(), 'cmd_scroll_down x2');

        if (DEBUG) console.log(`1st: ${result1.delta}px, 2nd: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);
        expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(15);
    });

    test('pressing 5j scrolls 5 times the distance of j', async () => {
        // Measure single j distance
        const result1 = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        const singleDistance = result1.delta;

        // Reset
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);

        // Set up listener before 5j sequence
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

        await swCoverage?.snapshot();
        await page.keyboard.press('5');
        await page.keyboard.press('j');

        const { baseline, final } = await scrollPromise;
        if (swCoverage) printCoverageDelta(await swCoverage.delta(), 'cmd_scroll_down 5j');

        const repeatDistance = final - baseline;
        const ratio = repeatDistance / singleDistance;

        if (DEBUG) console.log(`Single j: ${singleDistance}px, 5j: ${repeatDistance}px (ratio: ${ratio.toFixed(2)}x)`);
        expect(ratio).toBeGreaterThanOrEqual(3.5);
        expect(ratio).toBeLessThanOrEqual(6.5);
    });
});
