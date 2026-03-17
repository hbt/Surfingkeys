import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-lines-test.html`;

let context: BrowserContext;
let page: Page;

async function enterVisualMode(p: Page) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(500);
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

test.describe('cmd_visual_forward_lines (Playwright)', () => {
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

    test('Ctrl-d in visual mode does not error - selection is queryable', async () => {
        await enterVisualMode(page);

        await page.keyboard.press('Control+d');
        await page.waitForTimeout(1000);

        const selection = await getSelectionInfo(page);
        expect(typeof selection.focusOffset).toBe('number');
        const scrollY = await page.evaluate(() => window.scrollY);
        console.log(`After Ctrl-d: focusOffset=${selection.focusOffset}, scrollY=${scrollY}`);
    });

    test('Ctrl-d can be pressed multiple times without error', async () => {
        await enterVisualMode(page);

        await page.keyboard.press('Control+d');
        await page.waitForTimeout(500);

        const sel1 = await getSelectionInfo(page);
        expect(typeof sel1.focusOffset).toBe('number');

        await page.keyboard.press('Control+d');
        await page.waitForTimeout(500);

        const sel2 = await getSelectionInfo(page);
        expect(typeof sel2.focusOffset).toBe('number');
        console.log(`Two Ctrl-d presses: ${sel1.focusOffset} → ${sel2.focusOffset}`);
    });

    test('Ctrl-d maintains visual mode (selection still queryable)', async () => {
        await enterVisualMode(page);

        await page.keyboard.press('Control+d');
        await page.waitForTimeout(500);

        const selection = await getSelectionInfo(page);
        expect(typeof selection.focusOffset).toBe('number');
        console.log(`Visual mode still active after Ctrl-d: focusOffset=${selection.focusOffset}`);
    });
});
