import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a],
            bubbles: true,
            composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const SUITE_LABEL = 'cmd_marks_add';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const LOCAL_MARKS_KEY = 'surfingkeys.localMarks';

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getBackgroundMarks(ctx: BrowserContext): Promise<Record<string, any>> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.storage.local.get('marks', (data: any) => resolve(data.marks || {}));
        });
    });
}

async function clearAllMarks(ctx: BrowserContext, p: Page): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(() => {
        return new Promise<void>((resolve) => {
            chrome.storage.local.set({ marks: {} }, () => resolve());
        });
    });
    await p.evaluate((key) => localStorage.removeItem(key), LOCAL_MARKS_KEY);
}

async function getLocalMarks(p: Page): Promise<Record<string, any>> {
    return p.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), LOCAL_MARKS_KEY);
}

async function waitForLocalMark(p: Page, mark: string, timeoutMs = 3000): Promise<Record<string, any> | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const marks = await getLocalMarks(p);
        if (marks[mark]) return marks[mark];
        await p.waitForTimeout(50);
    }
    return undefined;
}

async function waitForBackgroundMark(ctx: BrowserContext, mark: string, timeoutMs = 3000): Promise<Record<string, any> | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const marks = await getBackgroundMarks(ctx);
        if (marks[mark]) return marks[mark];
        await new Promise((r) => setTimeout(r, 50));
    }
    return undefined;
}

test.describe('cmd_marks_add (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(100);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await clearAllMarks(context, page);
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'm', 'cmd_marks_add');
    });

    test('cmd_marks_add is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // normal.addVIMark — prompts for mark key character
            await page.mouse.click(100, 100);
            const ok = await invokeCommand(page, 'cmd_marks_add');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);
        });
    });

    test('lowercase mark (a-z) is stored page-locally, not in background storage', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('m');
            await page.waitForTimeout(150);
            await page.keyboard.press('a');

            const markA = await waitForLocalMark(page, 'a');
            expect(markA).toBeDefined();
            expect(markA!.url).toBe(FIXTURE_URL);

            const backgroundMarks = await getBackgroundMarks(context);
            expect(backgroundMarks['a']).toBeUndefined();
        });
    });

    test('uppercase mark (A-Z) is stored in background storage, not page-locally', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await page.keyboard.press('m');
            await page.waitForTimeout(150);
            await page.keyboard.press('A');

            const markA = await waitForBackgroundMark(context, 'A');
            expect(markA).toBeDefined();
            expect(markA!.url).toBe(FIXTURE_URL);

            const localMarks = await getLocalMarks(page);
            expect(localMarks['A']).toBeUndefined();
        });
    });
});
