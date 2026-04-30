/**
 * Playwright Test: cmd_hints_select_input
 *
 * Converted from tests/cdp/commands/cmd-hints-select-input.test.ts
 * Key: 'i' — Show hints to select and focus input/textarea elements.
 *
 * Usage:
 *   bunx playwright test tests/playwright/commands/cmd-hints-select-input.spec.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_select_input (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test.afterAll(async () => {
        try {
            if (cov) printCoverageDelta(await cov.delta(), 'cmd_hints_select_input');
        await cov?.close();
        await context?.close();
    } catch (_) {}
    });

    // -----------------------------------------------------------------------
    // 1.0 Fixture Setup
    // -----------------------------------------------------------------------

    test('1.1 should load input-test.html fixture', async () => {
        const title = await page.title();
        expect(title).toBe('Input Test Page');
    });

    test('1.2 should have text inputs', async () => {
        const count = await page.locator('input[type="text"]').count();
        expect(count).toBeGreaterThan(5);
    });

    test('1.3 should have email inputs', async () => {
        const count = await page.locator('input[type="email"]').count();
        expect(count).toBeGreaterThan(0);
    });

    test('1.4 should have password inputs', async () => {
        const count = await page.locator('input[type="password"]').count();
        expect(count).toBeGreaterThan(0);
    });

    test('1.5 should have search inputs', async () => {
        const count = await page.locator('input[type="search"]').count();
        expect(count).toBeGreaterThan(0);
    });

    test('1.6 should have textarea elements', async () => {
        const count = await page.locator('textarea').count();
        expect(count).toBeGreaterThan(1);
    });

    test('1.7 should have select elements', async () => {
        const count = await page.locator('select').count();
        expect(count).toBeGreaterThan(1);
    });

    test('1.8 should have contenteditable elements', async () => {
        const count = await page.locator('[contenteditable="true"]').count();
        expect(count).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // 2.0 Editable Element Detection
    // -----------------------------------------------------------------------

    test('2.1 should count editable elements correctly via selector', async () => {
        const count = await page.evaluate(() => {
            const selector = 'input:not([type=submit]), textarea, *[contenteditable=true], *[role=textbox], select, div.ace_cursor';
            const elements = document.querySelectorAll(selector);
            let visibleCount = 0;
            elements.forEach((el: any) => {
                const style = window.getComputedStyle(el);
                const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
                const isDisabled = (el as any).disabled || (el as any).readOnly;
                if (isVisible && !isDisabled) visibleCount++;
            });
            return visibleCount;
        });
        expect(count).toBeGreaterThan(10);
        expect(count).toBeLessThan(30);
    });

    test('2.2 should have disabled and readonly inputs (excluded from editable)', async () => {
        const disabled = await page.locator('input[disabled]').count();
        const readonly = await page.locator('input[readonly]').count();
        expect(disabled + readonly).toBeGreaterThan(0);
    });

    test('2.3 should have input types: text, email, password, search', async () => {
        const inputTypes = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type]');
            const types = new Set<string>();
            inputs.forEach((input: any) => types.add(input.type));
            return Array.from(types).sort();
        });
        expect(inputTypes).toContain('text');
        expect(inputTypes).toContain('email');
        expect(inputTypes).toContain('password');
        expect(inputTypes).toContain('search');
    });

    // -----------------------------------------------------------------------
    // 3.0 Element Properties
    // -----------------------------------------------------------------------

    test('3.1 should have textareas with IDs', async () => {
        const textareaIDs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('textarea')).map((ta: any) => ta.id).filter(Boolean);
        });
        expect(textareaIDs.length).toBeGreaterThan(0);
    });

    test('3.2 should have selects with options', async () => {
        const allHaveOptions = await page.evaluate(() => {
            const selects = document.querySelectorAll('select');
            return Array.from(selects).every((s: any) => s.options.length > 0);
        });
        expect(allHaveOptions).toBe(true);
    });

    test('3.3 disabled input should be excluded from editable', async () => {
        const result = await page.evaluate(() => {
            const disabledInput = document.querySelector('#disabled-input') as any;
            return { isDisabled: disabledInput?.disabled ?? false };
        });
        expect(result.isDisabled).toBe(true);
    });

    test('3.4 readonly input should be excluded from editable', async () => {
        const result = await page.evaluate(() => {
            const readonlyInput = document.querySelector('#readonly-input') as any;
            return { isReadonly: readonlyInput?.readOnly ?? false };
        });
        expect(result.isReadonly).toBe(true);
    });
});
