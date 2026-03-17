import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-lines-test.html`;

let context: BrowserContext;
let page: Page;

async function enterVisualMode(p: Page) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(300);
}

async function getCurrentLineNumber(p: Page): Promise<number | null> {
    return p.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || !sel.focusNode) return null;
        let node: Node | null = sel.focusNode;
        while (node && node.nodeType !== Node.ELEMENT_NODE) {
            node = node.parentNode;
        }
        while (node) {
            const el = node as Element;
            if (el.id && el.id.startsWith('line')) {
                const num = parseInt(el.id.replace('line', ''));
                return isNaN(num) ? null : num;
            }
            node = node.parentNode;
        }
        return null;
    });
}

test.describe('cmd_visual_forward_line (Playwright)', () => {
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

    test('pressing j in visual mode moves cursor forward one line', async () => {
        await enterVisualMode(page);

        const initialLine = await getCurrentLineNumber(page);
        console.log(`Initial line after entering visual mode: ${initialLine}`);
        expect(initialLine).toBeTruthy();

        await page.keyboard.press('j');
        await page.waitForTimeout(300);

        const finalLine = await getCurrentLineNumber(page);
        console.log(`After j: line ${initialLine} → ${finalLine}`);

        expect(finalLine).toBeTruthy();
        expect(finalLine).not.toBe(initialLine);
    });

    test('pressing j multiple times moves forward progressively', async () => {
        await enterVisualMode(page);

        const startLine = await getCurrentLineNumber(page);

        await page.keyboard.press('j');
        await page.waitForTimeout(300);
        const afterFirst = await getCurrentLineNumber(page);

        await page.keyboard.press('j');
        await page.waitForTimeout(300);
        const afterSecond = await getCurrentLineNumber(page);

        console.log(`Progression: ${startLine} → ${afterFirst} → ${afterSecond}`);

        expect(afterFirst).toBeTruthy();
        expect(afterSecond).toBeTruthy();
        expect(afterFirst).not.toBe(startLine);
        expect(afterSecond).not.toBe(afterFirst);
    });

    test('j moves cursor to a higher line number', async () => {
        await enterVisualMode(page);

        const before = await getCurrentLineNumber(page);
        expect(before).toBeTruthy();

        await page.keyboard.press('j');
        await page.waitForTimeout(300);

        const after = await getCurrentLineNumber(page);
        console.log(`Line ${before} → ${after}`);
        expect(after).toBeGreaterThan(before!);
    });
});
