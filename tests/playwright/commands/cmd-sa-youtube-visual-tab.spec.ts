import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;
const SUITE_LABEL = 'sa_youtube_visual_tab';
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

test.describe('sa_youtube_visual_tab (sY — Search selected with YouTube interactive)', () => {
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
    test.afterAll(async () => { await covBg?.close(); await context?.close(); });
    test.afterEach(async () => {
        try { await pressEscapeToCloseOmnibar(page); await page.waitForTimeout(200); } catch (_) {}
    });

    test('sY opens youtube search omnibar in interactive mode', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await selectTextInElement(page, '#line1');
                await page.waitForTimeout(100);
                await page.keyboard.press('s');
                await page.waitForTimeout(50);
                await page.keyboard.press('Y');
                const opened = await waitForOmnibarState(page, true);
                if (DEBUG) console.log('Omnibar open state after sY:', opened);
                expect(opened).toBe(true);
            },
        );
    });
});
