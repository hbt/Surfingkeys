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

const KEY = 'ymv';
const UNIQUE_ID = 'cmd_yank_multiple_elements';
const SUITE_LABEL = 'cmd_yank_multiple_elements';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function fetchHintSnapshot(p: Page) {
    return p.evaluate(() => {
        const host = document.querySelector('.surfingkeys_hints_host') as any;
        if (!host?.shadowRoot) return { found: false, count: 0, sortedHints: [] as string[] };
        const divs = Array.from(host.shadowRoot.querySelectorAll('div')).filter((d: any) => {
            const text = (d.textContent || '').trim();
            return text.length >= 1 && text.length <= 3 && /^[A-Z]+$/.test(text);
        });
        return {
            found: divs.length > 0,
            count: divs.length,
            sortedHints: (divs as any[]).map((d: any) => d.textContent?.trim()).sort() as string[],
        };
    });
}

async function waitForHintsCleared(p: Page, timeout = 4000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (!snap.found || snap.count === 0) return;
        await p.waitForTimeout(100);
    }
    throw new Error('Hints did not clear');
}

test.describe('cmd_yank_multiple_elements (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
    });

    test.afterEach(async () => {
        try {
            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);
        } catch (_) {}
        await page.evaluate(() => {
            document.querySelectorAll('.surfingkeys_hints_host').forEach(h => h.remove());
        });
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_yank_multiple_elements is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Calls hints.create(textAnchorPat, ..., {multipleHits: true})
            // Hints appear for text nodes; test verifies no error on invocation.
            await page.mouse.click(100, 100);
            const ok = await invokeCommand(page, 'cmd_yank_multiple_elements');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);
        });
    });
});
