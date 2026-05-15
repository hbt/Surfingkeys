import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;
const SUITE_LABEL = 'sa_github_visual';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function closeExtraPages(fixturePage: Page) {
    for (const p of context.pages()) {
        if (p !== fixturePage) await p.close().catch(() => {});
    }
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

test.describe('sa_github_visual (sh — Search selected text with GitHub)', () => {
    test.setTimeout(30_000);

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
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
        await closeExtraPages(page);
        await page.waitForTimeout(100);
    });

    test('sh opens a new tab with github search URL', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await selectTextInElement(page, '#line1');
                await page.waitForTimeout(100);

                const newPagePromise = context.waitForEvent('page', { timeout: 8000 });

                await page.keyboard.press('s');
                await page.waitForTimeout(50);
                await page.keyboard.press('h');

                const newTab = await newPagePromise;
                await newTab.waitForLoadState('domcontentloaded').catch(() => {});

                const url = newTab.url();
                if (DEBUG) console.log(`New tab URL: ${url}`);

                expect(url).toContain('github.com');
                expect(url).toContain('q=');
                await newTab.close().catch(() => {});
            },
        );
    });
});
