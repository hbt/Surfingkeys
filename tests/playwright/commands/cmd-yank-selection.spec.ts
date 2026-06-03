import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const KEY = 'g-032';
const UNIQUE_ID = 'cmd_yank_selection';

const SUITE_LABEL = 'cmd_yank_selection';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_yank_selection (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
    });

    test('copies selected text to clipboard', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const selectedText = await page.evaluate(() => {
                const el = document.body.querySelector('p, h1, h2, div') as HTMLElement;
                const text = el?.textContent?.trim().slice(0, 30) || 'hello world';
                const range = document.createRange();
                range.selectNodeContents(el || document.body);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
                return window.getSelection()!.toString().trim().slice(0, 30);
            });
            if (DEBUG) console.log(`Selected text: "${selectedText}"`);
            expect(selectedText.length).toBeGreaterThan(0);

            const ok = await invokeCommand(page, UNIQUE_ID);
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            await page.waitForTimeout(200);
            const clipText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
            if (DEBUG) console.log(`Clipboard: "${clipText}"`);

            expect(clipText.trim().slice(0, 30)).toBe(selectedText);
        });
    });

    test('does nothing when no text is selected', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.getSelection()!.removeAllRanges());
            await page.evaluate(() => navigator.clipboard.writeText('sentinel')).catch(() => {});

            const ok = await invokeCommand(page, UNIQUE_ID);
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            await page.waitForTimeout(200);
            const clipText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
            if (DEBUG) console.log(`Clipboard after empty selection: "${clipText}"`);
            expect(clipText).toBe('sentinel');
        });
    });
});
