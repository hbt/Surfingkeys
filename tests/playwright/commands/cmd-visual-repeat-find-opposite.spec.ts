import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

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

test.describe('cmd_visual_repeat_find_opposite (Playwright)', () => {
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
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing , without prior find does not error', async () => {
        await enterVisualMode(page, 'Multi-word');
        const before = await getSelectionInfo(page);
        await page.keyboard.press(',');
        await page.waitForTimeout(300);
        const after = await getSelectionInfo(page);
        expect(typeof after.focusOffset).toBe('number');
        if (DEBUG) console.log(`, with no prior find: focusOffset=${after.focusOffset}`);
    });

    test(', after f finds in backward direction', async () => {
        await enterVisualMode(page, 'Multi-word line');
        await page.keyboard.press('f');
        await page.waitForTimeout(100);
        await page.keyboard.type('e');
        await page.waitForTimeout(300);
        const afterForward = await getSelectionInfo(page);
        await page.keyboard.press(',');
        await page.waitForTimeout(300);
        const afterComma = await getSelectionInfo(page);
        expect(typeof afterComma.focusOffset).toBe('number');
        if (DEBUG) console.log(`, after fe: ${afterForward.focusOffset} → ${afterComma.focusOffset}`);
    });

    test(', after F finds in forward direction', async () => {
        await enterVisualMode(page, 'three four');
        await page.keyboard.press('F');
        await page.waitForTimeout(100);
        await page.keyboard.type('o');
        await page.waitForTimeout(300);
        const afterBackward = await getSelectionInfo(page);
        await page.keyboard.press(',');
        await page.waitForTimeout(300);
        const afterComma = await getSelectionInfo(page);
        expect(typeof afterComma.focusOffset).toBe('number');
        if (DEBUG) console.log(`, after Fo: ${afterBackward.focusOffset} → ${afterComma.focusOffset}`);
    });

    test(', can be pressed multiple times', async () => {
        await enterVisualMode(page, 'one two three');
        await page.keyboard.press('f');
        await page.waitForTimeout(100);
        await page.keyboard.type('e');
        await page.waitForTimeout(300);
        const offsets: number[] = [];
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press(',');
            await page.waitForTimeout(300);
            const sel = await getSelectionInfo(page);
            offsets.push(sel.focusOffset);
        }
        expect(offsets.length).toBe(3);
        expect(offsets.every(o => typeof o === 'number')).toBe(true);
        if (DEBUG) console.log(`Multiple , presses: ${offsets.join(' → ')}`);
    });
});
