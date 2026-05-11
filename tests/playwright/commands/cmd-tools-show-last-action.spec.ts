import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, setSkConf } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tools_show_last_action';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function waitForPopupVisible(p: Page, timeoutMs = 5000): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const frame of p.frames()) {
            if (!frame.url().includes('frontend.html')) continue;
            const text = await frame.evaluate(() => {
                const popup = document.getElementById('sk_popup');
                if (!popup) return null;
                // showPopup sets display="" (non-none); initial state is display:none
                if (popup.style.display === 'none') return null;
                return popup.textContent ?? null;
            }).catch(() => null);
            if (text !== null) return text;
        }
        await p.waitForTimeout(100);
    }
    return null;
}

test.describe('cmd_tools_show_last_action (Playwright)', () => {
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

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_tools_show_last_action shows lastKeys in popup', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Inject a known lastKeys value via the conf bridge
            // (lastKeys only records multi-char sequences via setLastKeys; inject directly)
            const injected = await setSkConf(page, 'lastKeys', [';e']);
            if (DEBUG) console.log(`Injected lastKeys: ${injected}`);

            const ok = await invokeCommand(page, 'cmd_tools_show_last_action');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            // The popup should appear in the frontend frame
            const popupText = await waitForPopupVisible(page, 4000);
            if (DEBUG) console.log(`popup text: ${JSON.stringify(popupText)}`);

            expect(popupText).not.toBeNull();
            // Should show the last key action — ';e' decoded
            expect(popupText!.length).toBeGreaterThan(0);
        });
    });
});
