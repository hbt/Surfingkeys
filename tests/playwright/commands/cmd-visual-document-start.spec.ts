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
            hasNode: !!sel?.focusNode,
        };
    });
}

async function getCurrentLineNumber(p: Page): Promise<number | null> {
    return p.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || !sel.focusNode) return null;
        let node: Node | null = sel.focusNode;
        while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
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

test.describe('cmd_visual_document_start (Playwright)', () => {
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
            window.scrollTo(0, 0);
            window.getSelection()?.removeAllRanges();
        });
        await page.waitForTimeout(200);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing gg in visual mode does not error', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');
        await page.waitForTimeout(300);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        console.log(`gg executed: focusOffset=${sel.focusOffset}`);
    });

    test('gg moves cursor to an earlier line', async () => {
        // Move down first using j
        await enterVisualMode(page);
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press('j');
            await page.waitForTimeout(100);
        }
        await page.waitForTimeout(200);
        const lineBefore = await getCurrentLineNumber(page);

        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');
        await page.waitForTimeout(500);

        const lineAfter = await getCurrentLineNumber(page);
        expect(lineAfter).toBeLessThan(lineBefore!);
        console.log(`gg moved: line ${lineBefore} → ${lineAfter}`);
    });

    test('gg moves cursor to beginning of document', async () => {
        await enterVisualMode(page);
        // Move down first
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('j');
            await page.waitForTimeout(100);
        }
        const beforeLine = await getCurrentLineNumber(page);
        expect(beforeLine).toBeGreaterThan(1);

        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');
        await page.waitForTimeout(500);

        const afterLine = await getCurrentLineNumber(page);
        console.log(`gg: line ${beforeLine} → ${afterLine}`);
        expect(afterLine).toBeLessThan(beforeLine!);
    });

    test('gg is idempotent at document start', async () => {
        await enterVisualMode(page);
        // First gg
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');
        await page.waitForTimeout(300);
        const line1 = await getCurrentLineNumber(page);

        // Second gg
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');
        await page.waitForTimeout(300);
        const line2 = await getCurrentLineNumber(page);

        expect(line1).not.toBeNull();
        expect(line2).toBe(line1);
    });

    test('gg after G moves to an earlier line', async () => {
        await enterVisualMode(page);
        // Go to end first
        await page.keyboard.press('G');
        await page.waitForTimeout(500);
        const lineAfterG = await getCurrentLineNumber(page);
        expect(lineAfterG).toBeGreaterThan(1);

        // Now go to start
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');
        await page.waitForTimeout(500);
        const lineAfterGG = await getCurrentLineNumber(page);
        expect(lineAfterGG).toBeLessThan(lineAfterG!);
        console.log(`G (line ${lineAfterG}) then gg (line ${lineAfterGG})`);
    });
});
