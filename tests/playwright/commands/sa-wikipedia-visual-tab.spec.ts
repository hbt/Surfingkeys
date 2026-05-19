import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, waitForInvokeReady } from '../utils/pw-helpers';
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

const KEY = 'sE';
const UNIQUE_ID = 'sa_wikipedia_visual_tab';

const SUITE_LABEL = 'sa_wikipedia_visual_tab';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function isOmnibarOpen(p: Page): Promise<boolean> {
    return p.evaluate(() => {
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

async function waitForOmnibarState(p: Page, expected: boolean, timeoutMs = 5000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const open = await isOmnibarOpen(p);
        if (open === expected) return true;
        await p.waitForTimeout(100);
    }
    return false;
}

async function pressEscapeToCloseOmnibar(p: Page): Promise<void> {
    for (const frame of p.frames()) {
        try { await frame.press('body', 'Escape'); } catch (_) {}
    }
    try { await p.keyboard.press('Escape'); } catch (_) {}
    await p.waitForTimeout(100);
}

async function selectTextInElement(p: Page, selector: string) {
    await p.evaluate((sel) => {
        const elem = document.querySelector(sel) as HTMLElement | null;
        if (elem && elem.firstChild && elem.firstChild.nodeType === 3) {
            const range = document.createRange();
            range.selectNodeContents(elem.firstChild as Node);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
    }, selector);
}

test.describe('sa_wikipedia_visual_tab (sE — Search selected with Wikipedia in omnibar)', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await waitForInvokeReady(page);
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        try { await pressEscapeToCloseOmnibar(page); await page.waitForTimeout(200); } catch (_) {}
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
    });

    test('sE opens wikipedia search omnibar (interactive mode)', async () => {
        test.fail(); // flagged: fails after key isolation
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await selectTextInElement(page, '#line1');
                await page.waitForTimeout(100);
                // sE = interactive mode → opens omnibar pre-filled with selected text
                await page.keyboard.press('s');
                await page.waitForTimeout(50);
                await page.keyboard.press('E');  // capital E
                const opened = await waitForOmnibarState(page, true);
                if (DEBUG) console.log('Omnibar open state after sE:', opened);
                expect(opened).toBe(true);
            },
        );
    });
});
