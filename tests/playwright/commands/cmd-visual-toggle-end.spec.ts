import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-lines-test.html`;

let context: BrowserContext;
let page: Page;

async function enterVisualMode(p: Page) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(300);
}

async function getSelectionInfo(p: Page) {
    return p.evaluate(() => {
        const sel = window.getSelection();
        return {
            type: sel?.type ?? '',
            anchorOffset: sel?.anchorOffset ?? 0,
            focusOffset: sel?.focusOffset ?? 0,
            text: sel?.toString() ?? '',
            hasNode: !!sel?.focusNode,
        };
    });
}

test.describe('cmd_visual_toggle_end (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => {
            window.getSelection()?.removeAllRanges();
            window.scrollTo(0, 0);
        });
        await page.waitForTimeout(200);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing o in visual mode does not error', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('o');
        await page.waitForTimeout(300);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        expect(typeof sel.focusOffset).toBe('number');
        if (DEBUG) console.log(`o executed: focusOffset=${sel.focusOffset}`);
    });

    test('o toggles anchor and focus after j creates range', async () => {
        await enterVisualMode(page);
        // Move down to create range selection
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('j');
            await page.waitForTimeout(150);
        }
        await page.waitForTimeout(200);
        const before = await getSelectionInfo(page);
        if (DEBUG) console.log(`Before o: type=${before.type}, anchor=${before.anchorOffset}, focus=${before.focusOffset}`);

        await page.keyboard.press('o');
        await page.waitForTimeout(300);
        const after = await getSelectionInfo(page);
        if (DEBUG) console.log(`After o: type=${after.type}, anchor=${after.anchorOffset}, focus=${after.focusOffset}`);

        // After toggle, anchor and focus should swap
        expect(after.anchorOffset).toBe(before.focusOffset);
        expect(after.focusOffset).toBe(before.anchorOffset);
    });

    test('o preserves selected text', async () => {
        await enterVisualMode(page);
        // Create selection with j
        for (let i = 0; i < 2; i++) {
            await page.keyboard.press('j');
            await page.waitForTimeout(150);
        }
        await page.waitForTimeout(200);
        const before = await getSelectionInfo(page);
        const textBefore = before.text;

        await page.keyboard.press('o');
        await page.waitForTimeout(300);
        const after = await getSelectionInfo(page);

        expect(after.text).toBe(textBefore);
        if (DEBUG) console.log(`o preserved text (length=${textBefore.length})`);
    });

    test('o toggled twice returns to original', async () => {
        await enterVisualMode(page);
        for (let i = 0; i < 2; i++) {
            await page.keyboard.press('j');
            await page.waitForTimeout(150);
        }
        await page.waitForTimeout(200);
        const initial = await getSelectionInfo(page);

        await page.keyboard.press('o');
        await page.waitForTimeout(300);
        await page.keyboard.press('o');
        await page.waitForTimeout(300);
        const back = await getSelectionInfo(page);

        expect(back.anchorOffset).toBe(initial.anchorOffset);
        expect(back.focusOffset).toBe(initial.focusOffset);
        if (DEBUG) console.log(`o x2 = original: anchor=${initial.anchorOffset}, focus=${initial.focusOffset}`);
    });

    test('o in caret mode does not error', async () => {
        await enterVisualMode(page);
        // Don't move — stay in caret mode
        await page.keyboard.press('o');
        await page.waitForTimeout(300);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        if (DEBUG) console.log(`o in caret: type=${sel.type}`);
    });
});
