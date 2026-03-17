import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;

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

test.describe('cmd_insert_delete_before_cursor (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        await clickInput(page);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('Ctrl+u deletes all characters before cursor', async () => {
        // "hello world" cursor at 5 → delete "hello", keep " world", cursor at 0
        await setInputState(page, 'hello world', 5);
        const before = await getInputState(page);
        expect(before.value).toBe('hello world');
        expect(before.selectionStart).toBe(5);

        await page.keyboard.press('Control+u');
        await page.waitForTimeout(100);

        const after = await getInputState(page);
        expect(after.value).toBe(' world');
        expect(after.selectionStart).toBe(0);
        console.log(`Delete before cursor: "${before.value}" pos ${before.selectionStart} → "${after.value}"`);
    });

    test('Ctrl+u at end deletes entire content', async () => {
        await setInputState(page, 'hello world', 11);

        await page.keyboard.press('Control+u');
        await page.waitForTimeout(100);

        const after = await getInputState(page);
        expect(after.value).toBe('');
        expect(after.selectionStart).toBe(0);
        console.log(`Delete all: "${after.value}" (empty)`);
    });

    test('Ctrl+u at position 0 leaves input unchanged', async () => {
        await setInputState(page, 'hello world', 0);

        await page.keyboard.press('Control+u');
        await page.waitForTimeout(100);

        const after = await getInputState(page);
        expect(after.value).toBe('hello world');
        expect(after.selectionStart).toBe(0);
        console.log(`Delete at 0: unchanged "${after.value}"`);
    });
});
