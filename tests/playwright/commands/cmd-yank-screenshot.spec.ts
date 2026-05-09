import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_yank_screenshot';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function waitForScreenshotPopup(p: Page, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const skFrame = p.frames().find(f => f.url().includes('frontend.html'));
        if (skFrame) {
            const r = await skFrame.evaluate(() => {
                const popup = document.getElementById('sk_popup');
                const img = popup?.querySelector('img') as HTMLImageElement | null;
                return {
                    visible: popup ? getComputedStyle(popup).display !== 'none' : false,
                    imgSrc: img?.src ?? '',
                };
            }).catch(() => ({ visible: false, imgSrc: '' }));
            if (r.visible && r.imgSrc.startsWith('data:image/png;base64,')) return r;
        }
        await p.waitForTimeout(200);
    }
    throw new Error('waitForScreenshotPopup: timed out');
}

test.describe('cmd_yank_screenshot (Playwright)', () => {
    test.setTimeout(20_000);

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
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } catch (_) {}
    });

    test('yg shows popup with PNG screenshot', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await test.step('Given the page is focused', async () => {
                const viewportSize = page.viewportSize();
                const centerX = viewportSize ? viewportSize.width / 2 : 400;
                const centerY = viewportSize ? viewportSize.height / 2 : 300;
                await page.mouse.click(centerX, centerY);
                await page.waitForTimeout(100);
            });

            await test.step('When the user presses yg to capture a screenshot', async () => {
                await page.keyboard.press('y');
                await page.waitForTimeout(30);
                await page.keyboard.press('g');
            });

            await test.step('Then a popup with a PNG screenshot should appear', async () => {
                const result = await waitForScreenshotPopup(page, 15000);
                expect(result.visible).toBe(true);
                expect(result.imgSrc).toMatch(/^data:image\/png;base64,/);
            });
        });
    });
});
