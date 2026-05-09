import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_yank_multiple_links';
const FIXTURE_URL = `${FIXTURE_BASE}/hints-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

// ---------------------------------------------------------------------------
// Hint helpers
// ---------------------------------------------------------------------------

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

async function waitForHints(p: Page, minCount = 1, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return snap;
        await p.waitForTimeout(100);
    }
    throw new Error(`Hints not shown after ${timeout}ms`);
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

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_yank_multiple_links (Playwright)', () => {
    test.setTimeout(30_000);

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

    test('cmd_yank_multiple_links shows hints in multipleHits mode', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            const ok = await invokeCommand(page, 'cmd_yank_multiple_links');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            const snap = await waitForHints(page, 10);
            expect(snap.count).toBeGreaterThanOrEqual(10);
        });
    });

    test('cmd_yank_multiple_links collects multiple URLs on selection', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, 'cmd_yank_multiple_links');

            const snap1 = await waitForHints(page, 10);
            const firstHint = snap1.sortedHints[0];

            // Select first link
            for (const char of firstHint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }
            // In multipleHits mode hints re-appear
            await page.waitForTimeout(400);

            const snap2 = await waitForHints(page, 1);
            expect(snap2.found).toBe(true);

            // Select second link
            const secondHint = snap2.sortedHints[1] ?? snap2.sortedHints[0];
            for (const char of secondHint) {
                await page.keyboard.press(char);
                await page.waitForTimeout(50);
            }
            await page.waitForTimeout(300);

            // Escape to finalize
            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);
            await page.waitForTimeout(200);

            const clipText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
            if (DEBUG) console.log(`Clipboard: ${clipText}`);

            // Should contain at least one URL (clipboard updated on each selection)
            expect(clipText.length).toBeGreaterThan(0);
        });
    });
});
