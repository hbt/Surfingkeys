import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-parent-test.html`;

let context: BrowserContext;
let page: Page;

async function enterVisualModeAtElement(p: Page, elementId: string) {
    await p.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const firstTextNode = walker.nextNode() as Text | null;
        if (firstTextNode) {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.setPosition(firstTextNode, 0);
        }
    }, elementId);
    await p.waitForTimeout(100);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    // Enter visual mode
    await p.keyboard.press('v');
    await p.waitForTimeout(300);
    // Select a word to enter Range mode (state 2)
    await p.keyboard.press('V');
    await p.waitForTimeout(100);
    await p.keyboard.press('w');
    await p.waitForTimeout(300);
}

async function getSelectionTextLength(p: Page): Promise<number> {
    return p.evaluate(() => window.getSelection()?.toString().length ?? 0);
}

async function getSelectionType(p: Page): Promise<string> {
    return p.evaluate(() => window.getSelection()?.type ?? '');
}

test.describe('cmd_visual_expand_parent (Playwright)', () => {
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
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
        } catch (_) {}
    });

    test('pressing p expands selection to parent element', async () => {
        await enterVisualModeAtElement(page, 'simple-para');
        const before = await getSelectionTextLength(page);
        await page.keyboard.press('p');
        await page.waitForTimeout(300);
        const after = await getSelectionTextLength(page);
        expect(after).toBeGreaterThan(before);
        expect(await getSelectionType(page)).toBe('Range');
        if (DEBUG) console.log(`p expanded: ${before} → ${after} chars`);
    });

    test('repeated p presses continue expanding selection', async () => {
        await enterVisualModeAtElement(page, 'simple-para');
        const initial = await getSelectionTextLength(page);
        const lengths: number[] = [initial];
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('p');
            await page.waitForTimeout(300);
            lengths.push(await getSelectionTextLength(page));
        }
        // Each expansion should be >= previous
        for (let i = 1; i < lengths.length; i++) {
            expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
        }
        if (DEBUG) console.log(`p expansions: ${lengths.join(' → ')}`);
    });

    test('p results in Range selection type', async () => {
        await enterVisualModeAtElement(page, 'simple-para');
        await page.keyboard.press('p');
        await page.waitForTimeout(300);
        const selType = await getSelectionType(page);
        expect(selType).toBe('Range');
        if (DEBUG) console.log(`Selection type after p: ${selType}`);
    });

    test('p works on inline elements', async () => {
        await enterVisualModeAtElement(page, 'inline-strong');
        const before = await getSelectionTextLength(page);
        await page.keyboard.press('p');
        await page.waitForTimeout(300);
        const after = await getSelectionTextLength(page);
        expect(after).toBeGreaterThan(before);
        if (DEBUG) console.log(`p on inline: ${before} → ${after} chars`);
    });
});
