import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tools_edit_url_new_tab';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function waitForEditorVisible(p: Page, timeoutMs = 5000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const frame of p.frames()) {
            if (!frame.url().includes('frontend.html')) continue;
            const visible = await frame.evaluate(() => {
                const editor = document.getElementById('sk_editor');
                if (!editor) return false;
                return editor.style.display !== 'none';
            }).catch(() => false);
            if (visible) return true;
        }
        await p.waitForTimeout(100);
    }
    return false;
}

test.describe('cmd_tools_edit_url_new_tab (Playwright)', () => {
    test.setTimeout(20_000);

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
        await callSKApi(page, 'mapcmdkey', ';u', 'cmd_tools_edit_url_new_tab');
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_tools_edit_url_new_tab opens editor with current URL', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const ok = await invokeCommand(page, 'cmd_tools_edit_url_new_tab');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            const editorVisible = await waitForEditorVisible(page, 4000);
            if (DEBUG) console.log(`Editor visible: ${editorVisible}`);
            expect(editorVisible).toBe(true);

            await page.keyboard.press('Escape');
            await page.waitForTimeout(400);
        });
    });
});
