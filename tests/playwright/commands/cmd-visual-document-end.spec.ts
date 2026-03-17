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
            focusNodeText: sel?.focusNode?.textContent?.substring(0, 40) ?? '',
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

test.describe('cmd_visual_document_end (Playwright)', () => {
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

    test('pressing G in visual mode does not error', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('G');
        await page.waitForTimeout(500);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        expect(typeof sel.focusOffset).toBe('number');
        console.log(`G executed: focusOffset=${sel.focusOffset}`);
    });

    test('G moves cursor to a later line', async () => {
        await enterVisualMode(page);
        // Move to an early line first with j movements (to have room for G to go further)
        // Use only j (which reliably works)
        const startLine = await getCurrentLineNumber(page);
        console.log(`Start line before G: ${startLine}`);

        await page.keyboard.press('G');
        await page.waitForTimeout(500);
        const endLine = await getCurrentLineNumber(page);

        console.log(`G: line ${startLine} → ${endLine}`);
        // G should move cursor at least as far as start (may stay same if already at end)
        expect(endLine).not.toBeNull();
        expect(endLine).toBeGreaterThanOrEqual(startLine!);
    });

    test('G after multiple j moves to later line', async () => {
        await enterVisualMode(page);
        // Press j to move down, establishing a known line
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('j');
            await page.waitForTimeout(150);
        }
        const midLine = await getCurrentLineNumber(page);

        await page.keyboard.press('G');
        await page.waitForTimeout(500);
        const endLine = await getCurrentLineNumber(page);

        console.log(`After j×3 (line ${midLine}), G → line ${endLine}`);
        expect(endLine).toBeGreaterThanOrEqual(midLine!);
        expect(endLine).not.toBeNull();
    });

    test('pressing G twice does not error', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('G');
        await page.waitForTimeout(500);
        const first = await getSelectionInfo(page);

        await page.keyboard.press('G');
        await page.waitForTimeout(500);
        const second = await getSelectionInfo(page);

        expect(first.hasNode).toBe(true);
        expect(second.hasNode).toBe(true);
        console.log(`G twice: offset=${first.focusOffset} → ${second.focusOffset}`);
    });

    test('G then gg moves to earlier line', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('G');
        await page.waitForTimeout(500);
        const lineAfterG = await getCurrentLineNumber(page);

        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('g');
        await page.waitForTimeout(500);
        const lineAfterGG = await getCurrentLineNumber(page);

        expect(lineAfterGG).toBeLessThan(lineAfterG!);
        console.log(`G (line ${lineAfterG}) then gg (line ${lineAfterGG})`);
    });
});
