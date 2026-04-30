import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/table-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function getHintSnapshot(p: Page): Promise<{ found: boolean; count: number; hints: { text: string }[]; allHints: string[] }> {
    return p.evaluate(() => {
        const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
        if (!hintsHost || !hintsHost.shadowRoot) {
            return { found: false, count: 0, hints: [], allHints: [] };
        }
        const hintElements = Array.from(hintsHost.shadowRoot.querySelectorAll('div')) as HTMLElement[];
        const hintDivs = hintElements.filter((d) => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });
        const hints = hintDivs.map((h) => ({ text: (h.textContent || '').trim() }));
        return {
            found: true,
            count: hintDivs.length,
            hints,
            allHints: hints.map((h) => h.text).sort(),
        };
    });
}

async function waitForHints(p: Page, minCount = 1, timeoutMs = 6000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await getHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`Hints did not appear (min ${minCount}) within ${timeoutMs}ms`);
}

async function waitForHintsCleared(p: Page, timeoutMs = 4000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await getHintSnapshot(p);
        if (!snap.found || snap.count === 0) return;
        await p.waitForTimeout(100);
    }
}

async function clearHints(p: Page): Promise<void> {
    await p.keyboard.press('Escape');
    await p.keyboard.press('Escape');
    await p.evaluate(() => {
        document.querySelectorAll('.surfingkeys_hints_host').forEach((h) => h.remove());
    });
}

test.describe('cmd_yank_table_columns (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_yank_table_columns');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await clearHints(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(50);
    });

    test('table fixture has expected column counts', async () => {
        const empCols = await page.evaluate(() => {
            const row = document.querySelector('#employees thead tr');
            return row ? row.children.length : 0;
        });
        expect(empCols).toBe(5);

        const prodCols = await page.evaluate(() => {
            const row = document.querySelector('#products thead tr');
            return row ? row.children.length : 0;
        });
        expect(prodCols).toBe(4);

        const simpleCols = await page.evaluate(() => {
            const row = document.querySelector('#simple thead tr');
            return row ? row.children.length : 0;
        });
        expect(simpleCols).toBe(3);
    });

    test('pressing ymc shows hints for table columns', async () => {
        await page.keyboard.press('y');
        await page.waitForTimeout(30);
        await page.keyboard.press('m');
        await page.waitForTimeout(30);
        await page.keyboard.press('c');

        await waitForHints(page, 1);

        const snap = await getHintSnapshot(page);
        expect(snap.found).toBe(true);
        expect(snap.count).toBeGreaterThan(0);
        if (DEBUG) console.log(`ymc hints: ${snap.count}`);
    });

    test('pressing Escape cancels ymc hint mode', async () => {
        await page.keyboard.press('y');
        await page.waitForTimeout(30);
        await page.keyboard.press('m');
        await page.waitForTimeout(30);
        await page.keyboard.press('c');

        await waitForHints(page, 1);

        await page.keyboard.press('Escape');
        await waitForHintsCleared(page);

        const snap = await getHintSnapshot(page);
        expect(snap.count).toBe(0);
    });

    test('simple table has correct data for column extraction', async () => {
        const col1Data = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('#simple tr')).map((tr) => {
                return tr.children.length > 0 ? (tr.children[0] as HTMLElement).innerText : '';
            });
        });

        expect(col1Data).toHaveLength(4); // 1 header + 3 data
        expect(col1Data[0]).toBe('Column A');
        expect(col1Data[1]).toBe('A1');
        expect(col1Data[2]).toBe('A2');
        expect(col1Data[3]).toBe('A3');
    });
});
