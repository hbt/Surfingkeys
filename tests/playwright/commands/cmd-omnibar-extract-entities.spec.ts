import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_omnibar_extract_entities';
const UNIQUE_ID = 'cmd_omnibar_extract_entities';
const FIXTURE_URL = `${FIXTURE_BASE}/extract-page-entities.html`;

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

async function waitForOmnibar(p: Page, open: boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isOmnibarOpen(p) === open) return;
        await p.waitForTimeout(100);
    }
    throw new Error(`waitForOmnibar(${open}): timed out after ${timeoutMs}ms`);
}

function getFrontendFrame(p: Page) {
    const frame = p.frames().find(f => f.url().includes('frontend.html'));
    if (!frame) throw new Error('frontend.html frame not found');
    return frame;
}

async function getResultRowTexts(p: Page): Promise<string[]> {
    const frame = getFrontendFrame(p);
    return frame.evaluate(() =>
        Array.from(document.querySelectorAll('#sk_omnibarSearchResult li')).map(li => li.textContent || ''),
    );
}

async function readClipboard(p: Page): Promise<string> {
    return p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
}

test.describe('cmd_omnibar_extract_entities (Playwright)', () => {
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

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.afterEach(async () => {
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
        } catch (_) {}
    });

    test('cmd_omnibar_extract_entities opens omnibar with all categories', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            const ok = await invokeCommand(page, UNIQUE_ID);
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            await waitForOmnibar(page, true);
            await page.waitForTimeout(200);

            const rows = await getResultRowTexts(page);
            if (DEBUG) console.log('rows:', rows);
            expect(rows.some(r => r.includes('[email]'))).toBe(true);
            expect(rows.some(r => r.includes('[ip]'))).toBe(true);
            expect(rows.some(r => r.includes('[url]'))).toBe(true);
            expect(rows.some(r => r.includes('[path]'))).toBe(true);
            expect(rows.some(r => r.includes('[word]'))).toBe(true);
        });
    });

    test('fuzzy query selects the email and copies it on Enter', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, UNIQUE_ID);
            await waitForOmnibar(page, true);

            await page.keyboard.type('datavault');
            await page.waitForTimeout(200);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);

            const clipText = await readClipboard(page);
            if (DEBUG) console.log(`clipboard: ${clipText}`);
            expect(clipText).toBe('agent@datavault.io');
        });
    });

    test('hyphenated word is extracted as a single whole token, not split', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, UNIQUE_ID);
            await waitForOmnibar(page, true);

            await page.keyboard.type('mirror-boot-investigator');
            await page.waitForTimeout(200);

            const rows = await getResultRowTexts(page);
            if (DEBUG) console.log('rows:', rows);
            expect(rows.some(r => r.includes('mirror-boot-investigator') && r.includes('[word]'))).toBe(true);

            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);

            const clipText = await readClipboard(page);
            expect(clipText).toBe('mirror-boot-investigator');
        });
    });

    test('" u" alias narrows to URL-only and copies the URL on Enter', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, UNIQUE_ID);
            await waitForOmnibar(page, true);

            await page.keyboard.type('report u');
            await page.waitForTimeout(200);

            const rows = await getResultRowTexts(page);
            if (DEBUG) console.log('rows:', rows);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every(r => r.includes('[url]'))).toBe(true);

            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);

            const clipText = await readClipboard(page);
            expect(clipText).toBe('https://reportsite.net/summary?id=42');
        });
    });

    test('" ip" alias narrows to IP-only and copies it on Enter', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, UNIQUE_ID);
            await waitForOmnibar(page, true);

            await page.keyboard.type(' ip');
            await page.waitForTimeout(200);

            const rows = await getResultRowTexts(page);
            if (DEBUG) console.log('rows:', rows);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every(r => r.includes('[ip]'))).toBe(true);

            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);

            const clipText = await readClipboard(page);
            expect(clipText).toBe('203.0.113.77');
        });
    });

    test('" p" alias narrows to path-only and copies it on Enter', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, UNIQUE_ID);
            await waitForOmnibar(page, true);

            await page.keyboard.type(' p');
            await page.waitForTimeout(200);

            const rows = await getResultRowTexts(page);
            if (DEBUG) console.log('rows:', rows);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every(r => r.includes('[path]'))).toBe(true);

            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);

            const clipText = await readClipboard(page);
            expect(clipText).toBe('/home/user/reports/summary.txt');
        });
    });

    test('"p summary" (leading alias) narrows to path-only and copies it on Enter', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, UNIQUE_ID);
            await waitForOmnibar(page, true);

            await page.keyboard.type('p summary');
            await page.waitForTimeout(200);

            const rows = await getResultRowTexts(page);
            if (DEBUG) console.log('rows:', rows);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every(r => r.includes('[path]'))).toBe(true);

            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);

            const clipText = await readClipboard(page);
            expect(clipText).toBe('/home/user/reports/summary.txt');
        });
    });

    test('"u report" (leading alias) narrows to URL-only and copies it on Enter', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            await page.mouse.click(100, 100);
            await invokeCommand(page, UNIQUE_ID);
            await waitForOmnibar(page, true);

            await page.keyboard.type('u report');
            await page.waitForTimeout(200);

            const rows = await getResultRowTexts(page);
            if (DEBUG) console.log('rows:', rows);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every(r => r.includes('[url]'))).toBe(true);

            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);

            const clipText = await readClipboard(page);
            expect(clipText).toBe('https://reportsite.net/summary?id=42');
        });
    });
});
