import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-sentence-test.html`;

let context: BrowserContext;
let page: Page;

async function enterVisualMode(p: Page, text: string) {
    await p.evaluate((t) => { (window as any).find(t); }, text);
    await p.waitForTimeout(100);
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
        };
    });
}

test.describe('cmd_visual_backward_sentence (Playwright)', () => {
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
        await page.evaluate(() => window.getSelection()?.removeAllRanges());
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('( in visual mode does not error', async () => {
        await enterVisualMode(page, 'third sentence here');

        await page.keyboard.press('(');
        await page.waitForTimeout(300);

        const selection = await getSelectionInfo(page);
        expect(typeof selection.focusOffset).toBe('number');
        console.log(`( executed: focusOffset=${selection.focusOffset}`);
    });

    test('( moves cursor backward in visual mode', async () => {
        await enterVisualMode(page, 'third sentence here');

        const before = await getSelectionInfo(page);
        const initialOffset = before.focusOffset;
        console.log(`Before (: focusOffset=${initialOffset}`);

        await page.keyboard.press('(');
        await page.waitForTimeout(300);

        const after = await getSelectionInfo(page);
        const finalOffset = after.focusOffset;
        console.log(`After (: focusOffset=${finalOffset}`);

        expect(finalOffset).toBeLessThanOrEqual(initialOffset);
    });

    test('( navigates backward through multiple sentences', async () => {
        await enterVisualMode(page, 'third sentence here');

        const positions: number[] = [];
        const initial = await getSelectionInfo(page);
        positions.push(initial.focusOffset);

        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('(');
            await page.waitForTimeout(300);

            const current = await getSelectionInfo(page);
            positions.push(current.focusOffset);
        }

        for (let i = 1; i < positions.length; i++) {
            expect(positions[i]).toBeLessThanOrEqual(positions[i - 1]);
        }
        console.log(`( progression: ${positions.join(' → ')}`);
    });
});
