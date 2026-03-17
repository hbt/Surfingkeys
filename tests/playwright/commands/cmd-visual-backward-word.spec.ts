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

async function getSelectionInfo(p: Page) {
    return p.evaluate(() => {
        const sel = window.getSelection();
        return {
            type: sel?.type ?? '',
            focusOffset: sel?.focusOffset ?? 0,
            text: sel?.toString() ?? '',
            hasNode: !!sel?.focusNode,
        };
    });
}

test.describe('cmd_visual_backward_word (Playwright)', () => {
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

    test('pressing b in visual mode does not error', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('b');
        await page.waitForTimeout(300);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        expect(typeof sel.focusOffset).toBe('number');
        console.log(`b executed: focusOffset=${sel.focusOffset}`);
    });

    test('pressing b multiple times does not error', async () => {
        await enterVisualMode(page);
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('b');
            await page.waitForTimeout(150);
        }
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        console.log(`After 5x b: focusOffset=${sel.focusOffset}`);
    });

    test('b at line start does not crash', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('0');
        await page.waitForTimeout(200);
        await page.keyboard.press('b');
        await page.waitForTimeout(300);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
    });

    test('w then b does not error', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('w');
        await page.waitForTimeout(200);
        await page.keyboard.press('b');
        await page.waitForTimeout(300);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        console.log(`w then b: type=${sel.type}`);
    });

    test('visual mode remains accessible after pressing b', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('b');
        await page.waitForTimeout(300);
        // Verify visual mode active via j
        const before = await page.evaluate(() => {
            const sel = window.getSelection();
            let node: Node | null = sel?.focusNode ?? null;
            while (node && (node as Element).nodeType !== 1) node = node?.parentNode ?? null;
            let id = '';
            while (node) { const el = node as Element; if (el.id) { id = el.id; break; } node = node.parentNode; }
            return id;
        });
        await page.keyboard.press('j');
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => {
            const sel = window.getSelection();
            let node: Node | null = sel?.focusNode ?? null;
            while (node && (node as Element).nodeType !== 1) node = node?.parentNode ?? null;
            let id = '';
            while (node) { const el = node as Element; if (el.id) { id = el.id; break; } node = node.parentNode; }
            return id;
        });
        expect(after).not.toBe(before);
        console.log(`After b then j: ${before} → ${after}`);
    });
});
