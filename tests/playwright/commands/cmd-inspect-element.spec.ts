/**
 * Playwright Test: cmd_inspect_element
 *
 * Verifies hints mode activates when the command is invoked.
 * The trigger/inspector server call is not verified here — it requires
 * xdotool on the host and cannot be intercepted from Playwright.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_inspect_element';
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
            found: true,
            count: divs.length,
            sortedHints: (divs as any[]).map((d: any) => d.textContent?.trim()).sort() as string[],
        };
    });
}

async function waitForHints(p: Page, minCount = 1, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const snap = await fetchHintSnapshot(p);
        if (snap.found && snap.count >= minCount) return;
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

test.describe('cmd_inspect_element', () => {
    test.setTimeout(60_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(600);
    });

    test.afterEach(async () => {
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
        } catch (_) {}
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('1.1 invoking command activates hints mode', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            const ok = await invokeCommand(page, 'cmd_inspect_element');
            expect(ok).toBe(true);
            await waitForHints(page, 1);

            const snap = await fetchHintSnapshot(page);
            expect(snap.found).toBe(true);
            expect(snap.count).toBeGreaterThan(0);
        });
    });

    test('1.2 hints clear on Escape', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, 'cmd_inspect_element');
            await waitForHints(page, 1);

            await page.keyboard.press('Escape');
            await waitForHintsCleared(page);

            const snap = await fetchHintSnapshot(page);
            expect(snap.count).toBe(0);
        });
    });

    test('1.3 selecting a hint clears hints', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, 'cmd_inspect_element');
            await waitForHints(page, 1);

            const snap = await fetchHintSnapshot(page);
            const firstHint = snap.sortedHints[0];
            if (firstHint) {
                for (const char of firstHint) {
                    await page.keyboard.press(char);
                    await page.waitForTimeout(50);
                }
                await waitForHintsCleared(page);
            }

            const afterSnap = await fetchHintSnapshot(page);
            expect(afterSnap.count).toBe(0);
        });
    });
});
