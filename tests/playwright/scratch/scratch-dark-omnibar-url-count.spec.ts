/**
 * Scratch test: trigger cmd_omnibar_url on the dark-theme-test.html fixture
 * and report the number of URL result items shown in the omnibar.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-dark-omnibar-url-count.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';

const FIXTURE_URL = `${FIXTURE_BASE}/dark-theme-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function isOmnibarOpen(p: Page): Promise<boolean> {
    return p.evaluate(() => {
        for (const div of Array.from(document.querySelectorAll('div'))) {
            if (div.shadowRoot) {
                const iframe = div.shadowRoot.querySelector('iframe.sk_ui') as HTMLElement | null;
                if (iframe) return iframe.style.height !== '0px' && iframe.style.height !== '';
            }
        }
        return false;
    });
}

async function waitForOmnibarState(p: Page, expected: boolean, timeoutMs = 5000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isOmnibarOpen(p) === expected) return true;
        await p.waitForTimeout(100);
    }
    return false;
}

/** Count <li> items in the omnibar resultsDiv inside the SK frontend iframe. */
async function countOmnibarResults(p: Page): Promise<number> {
    const frames = p.frames();
    const frontendFrame = frames.find(f => f.url().includes('frontend.html'));
    if (!frontendFrame) {
        console.log('frames:', frames.map(f => f.url()));
        return -1;
    }

    return frontendFrame.evaluate(() => {
        const items = document.querySelectorAll('#sk_omnibarSearchResult > ul > li');
        return items.length;
    });
}

test.describe('cmd_omnibar_url on dark-theme page', () => {
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

    test('cmd_omnibar_url opens and reports URL result count', async () => {
        // Ensure 't' triggers cmd_omnibar_url
        await page.evaluate(() => {
            document.dispatchEvent(new CustomEvent('surfingkeys:api', {
                detail: ['mapcmdkey', 't', 'cmd_omnibar_url'],
                bubbles: true, composed: true,
            }));
        });
        await page.waitForTimeout(100);

        // Trigger via key
        await page.keyboard.press('t');
        const opened = await waitForOmnibarState(page, true);
        expect(opened, 'omnibar should open').toBe(true);

        // Give results time to populate (URL history lookup is async)
        await page.waitForTimeout(1500);

        const count = await countOmnibarResults(page);
        console.log(`\n→ cmd_omnibar_url result count: ${count}`);

        if (count === 0) {
            // Dump resultsDiv innerHTML for debugging
            const frames = page.frames();
            const fe = frames.find(f => f.url().includes('frontend.html'));
            if (fe) {
                const html = await fe.evaluate(() => {
                    const el = document.querySelector('#sk_omnibarSearchResult');
                    return el ? el.innerHTML.slice(0, 500) : '(#sk_omnibarSearchResult not found)';
                });
                console.log('resultsDiv innerHTML:', html);
            }
        }

        expect(count).toBeGreaterThanOrEqual(0);

        // --- Color audit ---
        const fe = page.frames().find(f => f.url().includes('frontend.html'));
        if (fe) {
            const colors = await fe.evaluate(() => {
                function cs(el: Element) {
                    const s = getComputedStyle(el);
                    return { bg: s.backgroundColor, color: s.color };
                }
                const results: Record<string, any> = {};

                const body = document.body;
                results['body'] = cs(body);

                const omnibar = document.querySelector('#sk_omnibar') as Element | null;
                if (omnibar) results['#sk_omnibar'] = cs(omnibar);

                const input = document.querySelector('#sk_omnibarSearchArea input, #sk_omnibar input') as Element | null;
                if (input) results['input'] = cs(input);

                const searchArea = document.querySelector('#sk_omnibarSearchArea') as Element | null;
                if (searchArea) results['#sk_omnibarSearchArea'] = cs(searchArea);

                const resultsEl = document.querySelector('#sk_omnibarSearchResult') as Element | null;
                if (resultsEl) results['#sk_omnibarSearchResult'] = cs(resultsEl);

                const items = document.querySelectorAll('#sk_omnibarSearchResult > ul > li');
                items.forEach((li, i) => {
                    results[`li[${i}]`] = cs(li);
                    const divs = li.querySelectorAll('div, span');
                    divs.forEach((d, j) => {
                        if (j < 2) results[`li[${i}]>${d.tagName.toLowerCase()}[${j}]`] = cs(d);
                    });
                });

                return results;
            });

            console.log('\n--- Omnibar color audit ---');
            for (const [sel, { bg, color }] of Object.entries(colors)) {
                console.log(`  ${sel.padEnd(40)} bg=${bg}  color=${color}`);
            }
        }

        // Close
        for (const frame of page.frames()) {
            try { await frame.press('body', 'Escape'); } catch (_) {}
        }
        await page.keyboard.press('Escape');
    });
});
