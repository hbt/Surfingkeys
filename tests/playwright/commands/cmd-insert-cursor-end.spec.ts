import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_insert_cursor_end';
const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function clickInput(p: Page) {
    const coords = await p.evaluate(() => {
        const el = document.querySelector('#text-input-1') as HTMLElement;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    await p.mouse.click(coords.x, coords.y);
    await p.waitForFunction(() => (document.activeElement as HTMLElement).tagName === 'INPUT', { timeout: 4000 });
}

async function setInputState(p: Page, value: string, cursorPos: number) {
    await p.evaluate(([v, pos]) => {
        const el = document.activeElement as HTMLInputElement;
        el.value = v;
        el.setSelectionRange(pos, pos);
    }, [value, cursorPos] as [string, number]);
}

async function getInputState(p: Page) {
    return p.evaluate(() => {
        const el = document.activeElement as HTMLInputElement;
        return { value: el.value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd };
    });
}

test.describe('cmd_insert_cursor_end (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        await clickInput(page);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('Ctrl+e moves cursor from start to end of line', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await setInputState(page, 'hello world', 0);
            const before = await getInputState(page);
            expect(before.selectionStart).toBe(0);

            await page.keyboard.press('Control+e');
            await page.waitForTimeout(100);

            const after = await getInputState(page);
            expect(after.value).toBe('hello world');
            expect(after.selectionStart).toBe(11);
            expect(after.selectionEnd).toBe(11);
            if (DEBUG) console.log(`Cursor end: ${before.selectionStart} → ${after.selectionStart}`);
        });
    });

    test('Ctrl+e from middle of text moves to end', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await setInputState(page, 'hello world', 5);

            await page.keyboard.press('Control+e');
            await page.waitForTimeout(100);

            const after = await getInputState(page);
            expect(after.selectionStart).toBe(11);
        });
    });

    test('Ctrl+e at end stays at end', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await setInputState(page, 'hello world', 11);

            await page.keyboard.press('Control+e');
            await page.waitForTimeout(100);

            const after = await getInputState(page);
            expect(after.selectionStart).toBe(11);
            if (DEBUG) console.log(`Ctrl+e already at end: stays at ${after.selectionStart}`);
        });
    });
});
