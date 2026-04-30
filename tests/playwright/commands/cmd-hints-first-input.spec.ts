/**
 * Playwright Test: cmd_hints_first_input
 *
 * Converted from tests/cdp/commands/cmd-hints-first-input.test.ts
 * Key: 'gi' — Focus first editable input on the page.
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-first-input.spec.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_hints_first_input';
const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getActiveElement(p: Page) {
    return p.evaluate(() => {
        const el = document.activeElement as any;
        if (!el) return null;
        return {
            tagName: el.tagName,
            id: el.id || null,
            type: el.type || null,
            isFocused: document.activeElement === el,
        };
    });
}

async function checkInputLayer(p: Page) {
    return p.evaluate(() => {
        const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
        if (!hintsHost || !hintsHost.shadowRoot) return { found: false, masks: 0, activeInput: null };
        const holder = hintsHost.shadowRoot.querySelector('[mode=input]');
        if (!holder) return { found: false, masks: 0, activeInput: null };
        const masks = holder.querySelectorAll('mask');
        const activeMask = holder.querySelector('mask.activeInput');
        return {
            found: true,
            masks: masks.length,
            activeInput: activeMask ? { isActive: true } : null,
        };
    });
}

async function waitForInputFocus(p: Page, timeout = 4000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const el = await getActiveElement(p);
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`waitForInputFocus: timed out after ${timeout}ms`);
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_first_input (Playwright)', () => {
    test.setTimeout(60_000);

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
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test.afterAll(async () => {
        try {
            await covBg?.close();
            await context?.close();
        } catch (_) {}
    });

    // -----------------------------------------------------------------------
    // 1.0 Fixture Setup
    // -----------------------------------------------------------------------

    test('1.1 should load input-test.html fixture', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const title = await page.title();
            expect(title).toBe('Input Test Page');
        });
    });

    test('1.2 should have text inputs', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const count = await page.locator('input[type="text"]').count();
            expect(count).toBeGreaterThan(5);
        });
    });

    test('1.3 should have email, search, and password inputs', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            expect(await page.locator('input[type="email"]').count()).toBeGreaterThan(0);
            expect(await page.locator('input[type="search"]').count()).toBeGreaterThan(0);
            expect(await page.locator('input[type="password"]').count()).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------------
    // 2.0 Basic First Input Focus
    // -----------------------------------------------------------------------

    test('2.1 should focus first input when pressing gi', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('g');
            await page.keyboard.press('i');
            await waitForInputFocus(page);

            const activeEl = await getActiveElement(page);
            expect(activeEl).not.toBeNull();
            expect(activeEl?.tagName).toBe('INPUT');
            expect(activeEl?.isFocused).toBe(true);
        });
    });

    test('2.2 should focus the FIRST text input (text-input-1)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('g');
            await page.keyboard.press('i');
            await waitForInputFocus(page);

            const activeEl = await getActiveElement(page);
            expect(activeEl?.id).toBe('text-input-1');
            expect(activeEl?.type).toBe('text');
        });
    });

    test('2.3 should create input layer with masks for multiple inputs', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('g');
            await page.keyboard.press('i');
            await waitForInputFocus(page);

            const inputLayer = await checkInputLayer(page);
            expect(inputLayer.found).toBe(true);
            expect(inputLayer.masks).toBeGreaterThan(1);
            expect(inputLayer.activeInput?.isActive).toBe(true);
        });
    });

    test('2.4 should NOT create traditional hint labels (A, B, C)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('g');
            await page.keyboard.press('i');
            await waitForInputFocus(page);

            const hintsCheck = await page.evaluate(() => {
                const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
                if (!hintsHost || !hintsHost.shadowRoot) return { hasHints: false, hintCount: 0 };
                const hintDivs = Array.from(hintsHost.shadowRoot.querySelectorAll('div') as NodeListOf<HTMLElement>).filter(d => {
                    const text = (d.textContent || '').trim();
                    return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
                });
                return { hasHints: hintDivs.length > 0, hintCount: hintDivs.length };
            });

            expect(hintsCheck.hasHints).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // 3.0 Disabled / Readonly Exclusion
    // -----------------------------------------------------------------------

    test('3.1 should NOT focus readonly input', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('g');
            await page.keyboard.press('i');
            await waitForInputFocus(page);

            const activeEl = await getActiveElement(page);
            expect(activeEl?.id).not.toBe('readonly-input');
        });
    });

    // -----------------------------------------------------------------------
    // 4.0 Clearing and State
    // -----------------------------------------------------------------------

    test('4.1 should clear input layer when pressing Escape', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('g');
            await page.keyboard.press('i');
            await waitForInputFocus(page);

            const before = await checkInputLayer(page);
            expect(before.found).toBe(true);

            await page.keyboard.press('Escape');

            // Wait for input layer to clear
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
                const layer = await checkInputLayer(page);
                if (!layer.found) break;
                await page.waitForTimeout(50);
            }

            const after = await checkInputLayer(page);
            expect(after.found).toBe(false);
        });
    });

    test('4.2 should focus same input on repeated gi invocations', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('g');
            await page.keyboard.press('i');
            await waitForInputFocus(page);
            const first = await getActiveElement(page);

            await page.keyboard.press('Escape');
            await page.mouse.click(100, 100);

            await page.keyboard.press('g');
            await page.keyboard.press('i');
            await waitForInputFocus(page);
            const second = await getActiveElement(page);

            expect(first?.id).toBe(second?.id);
            expect(first?.id).toBe('text-input-1');
        });
    });
});
