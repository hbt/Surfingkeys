/**
 * Playwright Test: cmd_hints_download_image
 *
 * Tests for the ';di' key sequence (Download image hints).
 * - Key: ;di
 * - Behavior: Show hints to select and download images
 * - Fixture: image-download-test.html (5 images)
 *
 * Converted from tests/cdp/commands/cmd-hints-download-image.test.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_hints_download_image';
const FIXTURE_URL = `${FIXTURE_BASE}/image-download-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

// ---------------------------------------------------------------------------
// Hint helpers
// ---------------------------------------------------------------------------

async function fetchHintSnapshot(p: Page) {
    return p.evaluate(() => {
        const host = document.querySelector('.surfingkeys_hints_host') as any;
        if (!host?.shadowRoot) return { found: false, count: 0, sortedHints: [] as string[], sample: [] as any[] };
        const divs = Array.from(host.shadowRoot.querySelectorAll('div')).filter((d: any) => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });
        return {
            found: true,
            count: divs.length,
            sortedHints: (divs as any[]).map((d: any) => d.textContent?.trim()).sort() as string[],
            sample: (divs as any[]).slice(0, 5).map((h: any) => ({
                text: h.textContent?.trim(),
                visible: h.offsetParent !== null,
            })),
        };
    });
}

async function waitForHints(p: Page, minCount = 1, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`Hints not shown after ${timeout}ms`);
}

async function waitForHintsCleared(p: Page, timeout = 4000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (!snap.found || snap.count === 0) return;
        await p.waitForTimeout(100);
    }
    throw new Error('Hints did not clear');
}

async function triggerDownloadImageHints(p: Page) {
    // Press ';' then 'd' then 'i' to trigger ;di key sequence
    await p.keyboard.press(';');
    await p.waitForTimeout(50);
    await p.keyboard.press('d');
    await p.waitForTimeout(50);
    await p.keyboard.press('i');
    await p.waitForTimeout(50);
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_download_image (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(600);
    });

    test.afterEach(async () => {
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
        } catch (_) {}
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 page has 5 images', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const imgCount = await page.locator('img').count();
            expect(imgCount).toBe(5);
        });
    });

    test('1.2 no hints initially', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const snap = await fetchHintSnapshot(page);
            expect(snap.found).toBe(false);
            expect(snap.count).toBe(0);
        });
    });

    test('1.3 images have src attributes', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const imagesWithSrc = await page.evaluate(() =>
                Array.from(document.querySelectorAll('img')).filter((img: any) => img.src).length
            );
            expect(imagesWithSrc).toBe(5);
        });
    });

    // -----------------------------------------------------------------------
    // 2.0 Hint Creation
    // -----------------------------------------------------------------------

    test('2.1 should create hints when pressing ;di', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await triggerDownloadImageHints(page);
            await waitForHints(page, 1);

            const snap = await fetchHintSnapshot(page);
            expect(snap.found).toBe(true);
            expect(snap.count).toBeGreaterThan(0);
        });
    });

    test('2.2 hints are in shadowRoot', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await triggerDownloadImageHints(page);
            await waitForHints(page, 1);

            const hostInfo = await page.evaluate(() => {
                const h = document.querySelector('.surfingkeys_hints_host') as any;
                return {
                    found: !!h,
                    hasShadowRoot: !!h?.shadowRoot,
                    children: h?.shadowRoot?.children.length || 0,
                };
            });
            expect(hostInfo.found).toBe(true);
            expect(hostInfo.hasShadowRoot).toBe(true);
            expect(hostInfo.children).toBeGreaterThan(0);
        });
    });

    test('2.3 hint labels are uppercase letters', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await triggerDownloadImageHints(page);
            await waitForHints(page, 1);

            const snap = await fetchHintSnapshot(page);
            expect(snap.sample.length).toBeGreaterThan(0);
            for (const hint of snap.sample) {
                expect(hint.text).toMatch(/^[A-Z]{1,3}$/);
            }
        });
    });

    test('2.4 hint count does not exceed image count', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const imgCount = await page.locator('img').count();

            await page.mouse.click(100, 100);
            await triggerDownloadImageHints(page);
            await waitForHints(page, 1);

            const snap = await fetchHintSnapshot(page);
            expect(snap.count).toBeGreaterThan(0);
            expect(snap.count).toBeLessThanOrEqual(imgCount);
        });
    });

    // -----------------------------------------------------------------------
    // 3.0 Hint Clearing and Interaction
    // -----------------------------------------------------------------------

    test('3.1 hints clear on Escape', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await triggerDownloadImageHints(page);
            await waitForHints(page, 1);

            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);

            const snap = await fetchHintSnapshot(page);
            expect(snap.count).toBe(0);
        });
    });

    test('3.2 selecting a hint clears hints', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await triggerDownloadImageHints(page);
            await waitForHints(page, 1);

            const snap = await fetchHintSnapshot(page);
            const firstHint = snap.sortedHints[0];

            if (firstHint) {
                for (const char of firstHint) {
                    await page.keyboard.press(char);
                    await page.waitForTimeout(50);
                }
                await waitForHintsCleared(page);

                const afterSnap = await fetchHintSnapshot(page);
                expect(afterSnap.count).toBe(0);
            }
        });
    });

    test('3.3 hints are consistent across multiple invocations', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await triggerDownloadImageHints(page);
            await waitForHints(page, 1);
            const snap1 = await fetchHintSnapshot(page);

            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);

            await page.mouse.click(100, 100);
            await triggerDownloadImageHints(page);
            await waitForHints(page, 1);
            const snap2 = await fetchHintSnapshot(page);

            expect(snap1.count).toBe(snap2.count);
            expect(snap1.sortedHints).toEqual(snap2.sortedHints);
        });
    });
});
