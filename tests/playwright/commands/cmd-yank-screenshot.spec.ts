import * as fs from 'fs';
import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_yank_screenshot';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let covForPageUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;
let frontendUrl: string = '';

async function triggerYg(p: Page) {
    const vs = p.viewportSize();
    await p.mouse.click(vs ? vs.width / 2 : 400, vs ? vs.height / 2 : 300);
    await p.waitForTimeout(100);
    await p.keyboard.press('y');
    await p.waitForTimeout(30);
    await p.keyboard.press('g');
}

async function waitForScreenshotPopup(p: Page, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const skFrame = p.frames().find(f => f.url().includes('frontend.html'));
        if (skFrame) {
            const r = await skFrame.evaluate(() => {
                const popup = document.getElementById('sk_popup');
                const img = popup?.querySelector('img') as HTMLImageElement | null;
                const buttons = popup ? [...popup.querySelectorAll('button')].map(b => b.textContent ?? '') : [];
                return {
                    visible: popup ? getComputedStyle(popup).display !== 'none' : false,
                    imgSrc: img?.src ?? '',
                    buttons,
                };
            }).catch(() => ({ visible: false, imgSrc: '', buttons: [] as string[] }));
            if (r.visible && r.imgSrc.startsWith('data:image/png;base64,')) return r;
        }
        await p.waitForTimeout(200);
    }
    throw new Error('waitForScreenshotPopup: timed out');
}

test.describe('cmd_yank_screenshot (Playwright)', () => {
    test.setTimeout(25_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        covForPageUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(800);

        // Warmup: trigger yg once to ensure frontend.html is created, capture its URL
        await triggerYg(page);
        await waitForScreenshotPopup(page, 8000);
        frontendUrl = page.frames().find(f => f.url().includes('frontend.html'))?.url() ?? '';
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } catch (_) {}
    });

    test('yg shows popup with PNG screenshot and action buttons', async () => {
        // Attach V8 coverage to the frontend.html target before the action
        const covFrontend = frontendUrl ? await covForPageUrl?.(frontendUrl) : undefined;
        await covFrontend?.snapshot();

        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl: covForPageUrl },
            test.info().title,
            async () => {
                await triggerYg(page);

                const result = await waitForScreenshotPopup(page, 15000);

                expect(result.visible).toBe(true);
                expect(result.imgSrc).toMatch(/^data:image\/png;base64,/);
                expect(result.buttons.some(t => t.includes('Download'))).toBe(true);
                expect(result.buttons.some(t => t.includes('Copy'))).toBe(true);
            }
        );

        // Flush frontend.html coverage and verify showImagePopup was hit
        const frontendLabel = `${SUITE_LABEL}/${coverageSlug(test.info().title)}/frontend`;
        const frontendPath = await covFrontend?.flush(frontendLabel);

        if (process.env.COVERAGE === 'true' && frontendPath) {
            const data = JSON.parse(fs.readFileSync(frontendPath, 'utf-8'));
            const feScript = (data.result ?? []).find((s: any) => s.url?.includes('frontend.js'));
            expect(feScript, 'frontend.js not found in coverage data').toBeDefined();

            const hitFns = (feScript?.functions ?? [])
                .filter((f: any) => f.ranges?.some((r: any) => r.count > 0))
                .map((f: any) => f.functionName as string);

            console.log(`[frontend coverage] ${hitFns.length} functions hit`);
            console.log('[frontend coverage] showImagePopup:', hitFns.filter((n: string) => n?.includes('showImagePopup')));

            expect(
                hitFns.some((n: string) => n?.includes('showImagePopup')),
                `showImagePopup not hit. Hit functions: ${hitFns.slice(0, 20).join(', ')}`
            ).toBe(true);
        }
    });
});
