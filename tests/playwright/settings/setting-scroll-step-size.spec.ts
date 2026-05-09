import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, sendKeyAndWaitForScroll, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { applySetting, restoreSetting } from './settings-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('setting: scrollStepSize', () => {
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

    test('default scrollStepSize produces ~70px scroll per j keypress', async () => {
        const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        // Default is 70px; allow ±30px tolerance for smooth scrolling overshoot
        expect(result.delta).toBeGreaterThanOrEqual(40);
        expect(result.delta).toBeLessThanOrEqual(130);
    });

    test('setting scrollStepSize to 200 produces larger scroll', async () => {
        const applied = await applySetting(page, 'scrollStepSize', 200);
        expect(applied).toBe(true);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);

        const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 50 });

        // Should scroll significantly more than the default ~70px
        expect(result.delta).toBeGreaterThan(100);

        await restoreSetting(page, 'scrollStepSize');
    });

    test('setting scrollStepSize to 20 produces smaller scroll', async () => {
        const applied = await applySetting(page, 'scrollStepSize', 20);
        expect(applied).toBe(true);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);

        const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 5 });

        // Should scroll less than the default ~70px
        expect(result.delta).toBeLessThan(60);

        await restoreSetting(page, 'scrollStepSize');
    });

    test('restoring scrollStepSize returns to default behavior', async () => {
        // Set to a large value
        await applySetting(page, 'scrollStepSize', 300);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
        const largeDelta = (await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 })).delta;

        // Restore to default
        await restoreSetting(page, 'scrollStepSize');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
        const defaultDelta = (await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 })).delta;

        // Default should scroll less than the 300px override
        expect(defaultDelta).toBeLessThan(largeDelta);
        // And should be back in the expected range
        expect(defaultDelta).toBeGreaterThanOrEqual(40);
        expect(defaultDelta).toBeLessThanOrEqual(130);
    });
});
