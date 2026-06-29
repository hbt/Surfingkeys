/**
 * Scratch: press 't' then 'tc' with real config loaded, capture autocomplete popup contents.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-real-config-autocomplete.spec.ts \
 *       --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const REAL_CONFIG_URL = 'http://localhost:9601/config';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('real config keystroke autocomplete popup', () => {
    test.beforeAll(async () => {
        const { context: ctx } = await launchExtensionContext();
        context = ctx;

        const sw = context.serviceWorkers().find(w => w.url().includes('background.js'))
            ?? await context.waitForEvent('serviceworker', {
                predicate: w => w.url().includes('background.js'),
                timeout: 10_000,
            });
        await new Promise(resolve => setTimeout(resolve, 1500));

        const loadResult = await sw.evaluate((url: string) =>
            new Promise<{ status: string }>((resolve) => {
                (globalThis as any)._handleMessage(
                    { action: 'loadSettingsFromUrl', url },
                    {},
                    resolve,
                );
            }), REAL_CONFIG_URL,
        );

        if (loadResult.status !== 'Succeeded') {
            throw new Error(`Config load failed: ${loadResult.status}`);
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('press t — list autocomplete candidates', async () => {
        const keystroke = page.frameLocator('iframe[src*="frontend.html"]').locator('#sk_keystroke');

        await page.mouse.click(400, 300);
        await page.waitForTimeout(200);

        await page.keyboard.press('t');
        await page.waitForTimeout(200);

        await expect(keystroke).toBeVisible({ timeout: 3000 });

        // Wait for richHintsForKeystroke timeout (default 1000ms) + buffer
        await page.waitForTimeout(1300);

        const kbds = keystroke.locator('kbd');
        const count = await kbds.count();
        const candidates: string[] = [];
        for (let i = 0; i < count; i++) {
            candidates.push((await kbds.nth(i).textContent()) ?? '');
        }

        const fullText = await keystroke.textContent();
        console.log('[t] full text:', fullText);
        console.log('[t] kbd candidates:', JSON.stringify(candidates));
        console.log('[t] candidate count:', count);

        await page.screenshot({ path: 'test-artifacts/results/scratch-real-config-autocomplete-t.png' });

        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        expect(count).toBeGreaterThan(0);
    });

    test('press tc — popup shows magic sub-key candidates', async () => {
        const keystroke = page.frameLocator('iframe[src*="frontend.html"]').locator('#sk_keystroke');

        await page.mouse.click(400, 300);
        await page.waitForTimeout(200);

        await page.keyboard.press('t');
        await page.waitForTimeout(150);
        await page.keyboard.press('c');
        await page.waitForTimeout(200);

        await expect(keystroke).toBeVisible({ timeout: 3000 });

        // Wait for rich hints to expand
        await page.waitForTimeout(1300);

        const kbds = keystroke.locator('kbd');
        const count = await kbds.count();
        const candidates: string[] = [];
        for (let i = 0; i < count; i++) {
            candidates.push((await kbds.nth(i).textContent()) ?? '');
        }

        const fullText = await keystroke.textContent();
        console.log('[tc] full text:', fullText);
        console.log('[tc] kbd candidates:', JSON.stringify(candidates));
        console.log('[tc] candidate count:', count);

        await page.screenshot({ path: 'test-artifacts/results/scratch-real-config-autocomplete-tc.png' });

        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        expect(count).toBeGreaterThan(1);
    });
});
