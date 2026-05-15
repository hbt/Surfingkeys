import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'sa_baidu_omnibar';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

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

test.describe('sa_baidu_omnibar (ob — baidu search omnibar)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(800);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        try {
            await pressEscapeToCloseOmnibar(page);
            await page.waitForTimeout(200);
        } catch (_) {}
    });

    test('pressing ob opens baidu search omnibar', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // 'ob' is registered via addSearchAlias('b', 'baidu', ...)
                // No unique_id at runtime; use raw key presses.
                await page.keyboard.press('o');
                await page.waitForTimeout(50);
                await page.keyboard.press('b');

                const opened = await waitForOmnibarState(page, true);
                if (DEBUG) console.log('Omnibar open state after ob:', opened);
                expect(opened).toBe(true);
            },
        );
    });
});
