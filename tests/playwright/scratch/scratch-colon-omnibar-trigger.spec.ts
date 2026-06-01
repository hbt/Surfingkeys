/**
 * Scratch: confirm which trigger method reliably opens the `:` command bar (omnibar).
 *
 * Three methods tested:
 *   1. mapcmdkey(':', 'cmd_omnibar_commands') → keyboard.press(':')   ← expected to work
 *   2. No remap → keyboard.press('Shift+Semicolon')                   ← documents reliability
 *   3. No remap → keyboard.press(':')                                  ← documents reliability
 *
 * Results tell us how to fix cmd-cookies-*.spec.ts which use Shift+Semicolon.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-colon-omnibar-trigger.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

/* eslint-disable playwright/expect-expect */
import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

async function callSKApi(page: Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

async function isOmnibarOpen(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const divs = document.querySelectorAll('div');
        for (const div of Array.from(divs)) {
            if (div.shadowRoot) {
                const iframe = div.shadowRoot.querySelector('iframe.sk_ui');
                if (iframe) {
                    const h = (iframe as HTMLElement).style.height;
                    return h !== '0px' && h !== '';
                }
            }
        }
        return false;
    });
}

/** Throws on timeout — unlike the silently-returning version in cookie tests. */
async function waitForOmnibar(page: Page, open: boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isOmnibarOpen(page) === open) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`waitForOmnibar(${open}): timed out after ${timeoutMs}ms`);
}

async function closeOmnibar(page: Page): Promise<void> {
    try { await page.keyboard.press('Escape'); } catch (_) {}
    await page.waitForTimeout(200);
}

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.beforeAll(async () => {
    const result = await launchWithCoverage();
    context = result.context;
    cov = result.cov;
    page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(800);
});

test.afterAll(async () => {
    await cov?.close();
    await context?.close();
});

test('case 1 — mapcmdkey remap → keyboard.press(":")  [expected: PASS]', async () => {
    await page.mouse.click(100, 100);
    await callSKApi(page, 'unmapAllExcept', []);
    await callSKApi(page, 'mapcmdkey', ':', 'cmd_omnibar_commands');
    await page.waitForTimeout(200);

    await page.keyboard.press(':');
    await waitForOmnibar(page, true); // throws if omnibar never opens

    const open = await isOmnibarOpen(page);
    console.log(`[case 1] mapcmdkey + press(':') → omnibar open: ${open}`);
    expect(open).toBe(true);

    await closeOmnibar(page);
});

test('case 2 — no remap → keyboard.press("Shift+Semicolon")  [documents reliability]', async () => {
    await page.mouse.click(100, 100);
    // No remap — use default bindings (Shift+Semicolon is the default `:` key)
    await page.waitForTimeout(200);

    await page.keyboard.press('Shift+Semicolon');

    let open = false;
    try {
        await waitForOmnibar(page, true, 3000);
        open = await isOmnibarOpen(page);
    } catch (_) {
        open = false;
    }

    console.log(`[case 2] no remap + press('Shift+Semicolon') → omnibar open: ${open}`);
    // Document result without hard assertion — this case characterises reliability
    if (open) {
        console.log('[case 2] PASS — Shift+Semicolon worked');
        await closeOmnibar(page);
    } else {
        console.log('[case 2] FAIL — Shift+Semicolon did NOT open omnibar (confirms flakiness)');
    }
});

test('case 3 — no remap → keyboard.press(":")  [documents reliability]', async () => {
    await page.mouse.click(100, 100);
    await page.waitForTimeout(200);

    await page.keyboard.press(':');

    let open = false;
    try {
        await waitForOmnibar(page, true, 3000);
        open = await isOmnibarOpen(page);
    } catch (_) {
        open = false;
    }

    console.log(`[case 3] no remap + press(':') → omnibar open: ${open}`);
    if (open) {
        console.log('[case 3] PASS — bare ":" worked without remap');
        await closeOmnibar(page);
    } else {
        console.log('[case 3] FAIL — bare ":" did NOT open omnibar without remap');
    }
});

// ---------------------------------------------------------------------------
// Helpers for fuzzy filter cases
// ---------------------------------------------------------------------------

async function getCandidates(p: Page): Promise<string[]> {
    // The omnibar lives in a chrome-extension iframe accessible via page.frames()
    const skFrame = p.frames().find(f => f.url().includes('chrome-extension'));
    if (!skFrame) return [];
    // li.cmd holds the canonical command name (set by the Commands handler)
    return skFrame.locator('#sk_omnibar ul li').evaluateAll(
        (items: Element[]) => items.map(li => (li as any).cmd ?? '')
    );
}

async function openOmnibarWithRemap(p: Page): Promise<void> {
    await p.mouse.click(100, 100);
    await callSKApi(p, 'unmapAllExcept', []);
    await callSKApi(p, 'mapcmdkey', ':', 'cmd_omnibar_commands');
    await p.waitForTimeout(200);
    await p.keyboard.press(':');
    await waitForOmnibar(p, true);
}

// ---------------------------------------------------------------------------
// Case 4 — fuzzy filter: 'sess' matches session commands
// ---------------------------------------------------------------------------

test('case 4 — fuzzy filter "sess" matches createSession / deleteSession / openSession', async () => {
    await openOmnibarWithRemap(page);

    await page.keyboard.type('sess');
    await page.waitForTimeout(300);

    const candidates = await getCandidates(page);
    console.log('[case 4] candidates for "sess":', candidates);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some(c => /[Ss]ession/i.test(c))).toBe(true);

    await closeOmnibar(page);
});

// ---------------------------------------------------------------------------
// Case 5 — fuzzy filter: 'coo' matches cookie commands
// ---------------------------------------------------------------------------

test('case 5 — fuzzy filter "coo" matches clearCookies / listCookies / exportCookies', async () => {
    await openOmnibarWithRemap(page);

    await page.keyboard.type('coo');
    await page.waitForTimeout(300);

    const candidates = await getCandidates(page);
    console.log('[case 5] candidates for "coo":', candidates);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some(c => /[Cc]ookie/i.test(c))).toBe(true);

    await closeOmnibar(page);
});
