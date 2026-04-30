/**
 * Playwright Test: cmd_hints_copy_html
 *
 * Tests for the 'ch' subcommand within regional hints mode.
 * - Key: ch (after entering regional hints with 'L' and selecting an element)
 * - Behavior: Copy innerHTML from selected element to clipboard
 *
 * Converted from tests/cdp/commands/cmd-hints-copy-html.test.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_hints_copy_html';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

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
            found: true,
            count: divs.length,
            sortedHints: (divs as any[]).map((d: any) => d.textContent?.trim()).sort() as string[],
        };
    });
}

async function waitForRegionalHints(p: Page, minCount = 1, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`Regional hints not shown after ${timeout}ms`);
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

async function enterRegionalHintsAndSelectFirst(p: Page) {
    await p.mouse.click(100, 100);
    await p.keyboard.press('L');
    await waitForRegionalHints(p, 1);

    const snap = await fetchHintSnapshot(p);
    const firstHint = snap.sortedHints[0];
    expect(firstHint).toBeDefined();

    for (const char of firstHint) {
        await p.keyboard.press(char);
        await p.waitForTimeout(50);
    }
    return firstHint;
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

test.describe('cmd_hints_copy_html (Playwright)', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(600);
    });

    test.afterEach(async () => {
        try {
            await page.keyboard.press('Escape');
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

    // -----------------------------------------------------------------------
    // 1.0 Page Setup
    // -----------------------------------------------------------------------

    test('1.1 page has elements with HTML content', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const pCount = await page.locator('p').count();
            expect(pCount).toBeGreaterThan(40);

            const hasHTML = await page.evaluate(() => (document.querySelector('p')?.innerHTML?.length ?? 0) > 0);
            expect(hasHTML).toBe(true);
        });
    });

    test('1.2 link-line element contains nested HTML', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const html = await page.evaluate(() => (document.querySelector('#link-line') as HTMLElement)?.innerHTML || '');
            expect(html).toContain('<a');
            expect(html).toContain('href');
        });
    });

    // -----------------------------------------------------------------------
    // 2.0 Copy HTML Command
    // -----------------------------------------------------------------------

    test('2.1 ch command executes without error (hints cleared)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 0));
            await enterRegionalHintsAndSelectFirst(page);

            await page.keyboard.type('ch');
            await waitForHintsCleared(page);

            const snap = await fetchHintSnapshot(page);
            expect(snap.count).toBe(0);
        });
    });

    test('2.2 returns to normal mode after ch (can scroll)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.evaluate(() => window.scrollTo(0, 0));
            await enterRegionalHintsAndSelectFirst(page);

            await page.keyboard.type('ch');
            await waitForHintsCleared(page);

            const scrollBefore = await page.evaluate(() => window.scrollY);
            await page.keyboard.press('j');
            await page.waitForTimeout(300);
            const scrollAfter = await page.evaluate(() => window.scrollY);
            expect(scrollAfter).toBeGreaterThan(scrollBefore);
        });
    });

    test('2.3 nested-line element has span and nested-link', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const nestedHTML = await page.evaluate(() => (document.querySelector('#nested-line') as HTMLElement)?.innerHTML || '');
            expect(nestedHTML).toContain('span');
            expect(nestedHTML).toContain('nested-link');
        });
    });

    test('2.4 multi-link-line element has multiple links', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const html = await page.evaluate(() => (document.querySelector('#multi-link-line') as HTMLElement)?.innerHTML || '');
            expect(html).toContain('link1');
            expect(html).toContain('link2');
        });
    });
});
