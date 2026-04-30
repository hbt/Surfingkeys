import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/table-test.html`;

let context: BrowserContext;
let page: Page;

async function getHintSnapshot(p: Page): Promise<{ found: boolean; count: number; hints: { text: string }[] }> {
    return p.evaluate(() => {
        const hintsHost = document.querySelector('.surfingkeys_hints_host') as any;
        if (!hintsHost || !hintsHost.shadowRoot) {
            return { found: false, count: 0, hints: [] };
        }
        const hintElements = Array.from(hintsHost.shadowRoot.querySelectorAll('div')) as HTMLElement[];
        const hintDivs = hintElements.filter((d) => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });
        return {
            found: true,
            count: hintDivs.length,
            hints: hintDivs.map((h) => ({ text: (h.textContent || '').trim() })),
        };
    });
}

async function waitForHints(p: Page, minCount = 1, timeoutMs = 5000): Promise<void> {
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

test.describe('cmd_yank_table_column (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        await clearHints(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
    });

    test('table fixture loads with expected structure', async () => {
        const tableCount = await page.evaluate(() => document.querySelectorAll('table').length);
        expect(tableCount).toBeGreaterThanOrEqual(3);

        const hasEmployeeTable = await page.evaluate(() => document.querySelector('#employees') !== null);
        expect(hasEmployeeTable).toBe(true);

        const employeeCols = await page.evaluate(() => {
            const row = document.querySelector('#employees tr');
            return row ? row.children.length : 0;
        });
        expect(employeeCols).toBe(5);
    });

    test('pressing yc shows hints for table columns', async () => {
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('c');

        await waitForHints(page, 1);

        const snap = await getHintSnapshot(page);
        expect(snap.found).toBe(true);
        expect(snap.count).toBeGreaterThan(0);
        if (DEBUG) console.log(`Hints displayed: ${snap.count}`);
    });

    test('selecting a hint clears hints (command executed)', async () => {
        await page.keyboard.press('y');
        await page.waitForTimeout(50);
        await page.keyboard.press('c');

        await waitForHints(page, 1);

        const snap = await getHintSnapshot(page);
        const firstHint = snap.hints[0]?.text;
        expect(firstHint).toBeDefined();
        if (DEBUG) console.log(`Selecting hint: ${firstHint}`);

        for (const char of firstHint) {
            await page.keyboard.press(char);
            await page.waitForTimeout(50);
        }

        await waitForHintsCleared(page);

        const after = await getHintSnapshot(page);
        expect(after.count).toBe(0);
        if (DEBUG) console.log('Hints cleared after column selection');
    });
});
