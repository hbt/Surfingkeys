import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-lines-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

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

test.describe('cmd_visual_line_start (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_visual_line_start');
        await cov?.close();
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

    test('pressing 0 in visual mode does not error', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('0');
        await page.waitForTimeout(300);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        expect(typeof sel.focusOffset).toBe('number');
        if (DEBUG) console.log(`0 executed: focusOffset=${sel.focusOffset}`);
    });

    test('pressing 0 multiple times does not error', async () => {
        await enterVisualMode(page);
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('0');
            await page.waitForTimeout(150);
        }
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        if (DEBUG) console.log(`After 3x 0: focusOffset=${sel.focusOffset}`);
    });

    test('0 after l does not error', async () => {
        await enterVisualMode(page);
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('l');
            await page.waitForTimeout(100);
        }
        await page.keyboard.press('0');
        await page.waitForTimeout(300);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        if (DEBUG) console.log(`0 after l: focusOffset=${sel.focusOffset}`);
    });

    test('0 and $ in sequence do not error', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('$');
        await page.waitForTimeout(200);
        await page.keyboard.press('0');
        await page.waitForTimeout(300);
        const sel = await getSelectionInfo(page);
        expect(sel.hasNode).toBe(true);
        if (DEBUG) console.log(`$ then 0: type=${sel.type}`);
    });

    test('visual mode remains accessible after pressing 0', async () => {
        await enterVisualMode(page);
        await page.keyboard.press('0');
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
        if (DEBUG) console.log(`After 0 then j: ${before} → ${after}`);
    });
});
