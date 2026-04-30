import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function clickInput(p: Page) {
    const coords = await p.evaluate(() => {
        const el = document.querySelector('#text-input-1') as HTMLElement;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    await p.mouse.click(coords.x, coords.y);
    await p.waitForFunction(() => (document.activeElement as HTMLElement).tagName === 'INPUT', { timeout: 4000 });
}

async function setInputState(p: Page, value: string, cursorPos: number) {
    await p.evaluate(([v, pos]) => {
        const el = document.activeElement as HTMLInputElement;
        el.value = v;
        el.setSelectionRange(pos, pos);
    }, [value, cursorPos] as [string, number]);
}

async function getInputState(p: Page) {
    return p.evaluate(() => {
        const el = document.activeElement as HTMLInputElement;
        return { value: el.value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd };
    });
}

test.describe('cmd_insert_cursor_backward_word (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
        await clickInput(page);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_insert_cursor_backward_word');
        await cov?.close();
        await context?.close();
    });

    test('Alt+b moves cursor from end of text to just before last word', async () => {
        // "hello world" cursor at 11 (end): backwards over "world" stops at space → pos 5
        await setInputState(page, 'hello world', 11);
        const before = await getInputState(page);
        expect(before.selectionStart).toBe(11);

        await page.keyboard.press('Alt+b');
        await page.waitForTimeout(100);

        const after = await getInputState(page);
        expect(after.value).toBe('hello world');
        expect(after.selectionStart).toBe(5);
        expect(after.selectionEnd).toBe(5);
        if (DEBUG) console.log(`Backward word: cursor ${before.selectionStart} → ${after.selectionStart}`);
    });

    test('Alt+b cursor at start of word stops at space before it', async () => {
        // "hello world" cursor at 6 (start of "world"): immediately hits space at 5 → pos 5
        await setInputState(page, 'hello world', 6);

        await page.keyboard.press('Alt+b');
        await page.waitForTimeout(100);

        const after = await getInputState(page);
        expect(after.value).toBe('hello world');
        expect(after.selectionStart).toBe(5);
    });

    test('Alt+b at position 0 stays at 0', async () => {
        await setInputState(page, 'hello world', 0);

        await page.keyboard.press('Alt+b');
        await page.waitForTimeout(100);

        const after = await getInputState(page);
        expect(after.selectionStart).toBe(0);
        if (DEBUG) console.log(`Backward word at 0: stays at ${after.selectionStart}`);
    });
});
