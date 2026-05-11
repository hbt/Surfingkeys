import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { applySetting, restoreSetting } from './settings-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('setting: digitForRepeat', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test('default: 5j scrolls significantly more than 1j', async () => {
        // Single j
        const single = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);

        // 5j — wait for large scroll
        const scrollPromise = page.evaluate(
            ({ minDelta, timeoutMs }) => new Promise<{ baseline: number; final: number }>((resolve) => {
                const baseline = window.scrollY;
                let done = false;
                const listener = () => {
                    if (done) return;
                    if (window.scrollY - baseline >= minDelta) {
                        done = true;
                        window.removeEventListener('scroll', listener);
                        resolve({ baseline, final: window.scrollY });
                    }
                };
                window.addEventListener('scroll', listener);
                setTimeout(() => { if (!done) { done = true; window.removeEventListener('scroll', listener); resolve({ baseline, final: window.scrollY }); } }, timeoutMs);
            }),
            { minDelta: single.delta * 2, timeoutMs: 3000 },
        );
        await page.keyboard.press('5');
        await page.keyboard.press('j');
        const { baseline, final } = await scrollPromise;
        const fivejDelta = final - baseline;

        // 5j should move at least 2× a single j (smooth scroll coalesces keystrokes)
        expect(fivejDelta).toBeGreaterThan(single.delta * 2);
    });

    test('digitForRepeat=false: digit prefix is ignored — 5j scrolls like 1j', async () => {
        const applied = await applySetting(page, 'digitForRepeat', false);
        expect(applied).toBe(true);

        // Measure single j distance with digitForRepeat off
        const single = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);

        // Press 5 then j — with digitForRepeat=false the 5 should be ignored
        const scrollPromise = page.evaluate(
            ({ timeoutMs }) => new Promise<{ baseline: number; final: number }>((resolve) => {
                const baseline = window.scrollY;
                let done = false;
                const listener = () => {
                    if (!done) {
                        done = true;
                        window.removeEventListener('scroll', listener);
                        // Wait a beat for any further scrolling
                        setTimeout(() => resolve({ baseline, final: window.scrollY }), 300);
                    }
                };
                window.addEventListener('scroll', listener);
                setTimeout(() => { if (!done) { done = true; window.removeEventListener('scroll', listener); resolve({ baseline, final: window.scrollY }); } }, timeoutMs);
            }),
            { timeoutMs: 2000 },
        );

        await page.keyboard.press('5');
        await page.keyboard.press('j');
        const { final, baseline } = await scrollPromise;
        const prefixedDelta = final - baseline;

        // With digitForRepeat=false, 5j ≈ 1j (not 5× distance)
        // Allow 2× tolerance for smooth scroll overshoot
        expect(prefixedDelta).toBeLessThan(single.delta * 2.5);

        await restoreSetting(page, 'digitForRepeat');
    });
});
