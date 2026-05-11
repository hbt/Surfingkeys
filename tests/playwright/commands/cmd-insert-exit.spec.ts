import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_insert_exit';
const FIXTURE_URL = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_insert_exit (Playwright)', () => {
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

    test.beforeEach(async () => {
        // Blur any focused element between tests so each test starts in normal mode
        await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
        await page.waitForTimeout(100);
    });

    test('pressing Escape while in insert mode exits insert mode and blurs the input', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Click the input to enter insert mode
            await page.click('#text-input-1');
            await page.waitForTimeout(200);

            // Confirm we are in insert mode: the input should be focused
            const focusedBefore = await page.evaluate(() => document.activeElement?.id ?? '');
            if (DEBUG) console.log(`Active element before ESC: ${focusedBefore}`);
            expect(focusedBefore).toBe('text-input-1');

            // Press Escape — this should trigger cmd_insert_exit
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);

            // After ESC the input should be blurred (insert mode exited)
            const activeTagAfter = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase() ?? '');
            if (DEBUG) console.log(`Active element tag after ESC: ${activeTagAfter}`);
            expect(activeTagAfter).not.toBe('input');
        });
    });

    test('after pressing Escape a normal-mode key (j) scrolls instead of typing', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Make the page taller than the viewport so j has room to scroll
            await page.evaluate(() => {
                const spacer = document.createElement('div');
                spacer.id = 'scroll-spacer';
                spacer.style.height = '3000px';
                document.body.appendChild(spacer);
            });

            // Scroll to top so we have headroom to scroll down
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(100);

            const pageInfo = await page.evaluate(() => ({
                scrollHeight: document.body.scrollHeight,
                clientHeight: document.documentElement.clientHeight,
                isScrollable: document.body.scrollHeight > document.documentElement.clientHeight,
            }));
            if (DEBUG) console.log(`Page scroll info: ${JSON.stringify(pageInfo)}`);

            // Enter insert mode by clicking the input
            await page.click('#text-input-1');
            await page.waitForTimeout(200);

            // Confirm insert mode is active (input is focused)
            const focusedBefore = await page.evaluate(() => document.activeElement?.id ?? '');
            expect(focusedBefore).toBe('text-input-1');

            // Exit insert mode via Escape
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);

            // Confirm insert mode is gone (input is blurred)
            const activeTagAfterEsc = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase() ?? '');
            if (DEBUG) console.log(`Active element after ESC: ${activeTagAfterEsc}`);
            expect(activeTagAfterEsc).not.toBe('input');

            // Read original input value
            const valueBefore = await page.evaluate(() => (document.querySelector('#text-input-1') as HTMLInputElement).value);
            const scrollBefore = await page.evaluate(() => window.scrollY);

            // Press j — in normal mode this should scroll the page down.
            // Set up listener first (don't await — keeps Promise live in browser),
            // press j, then await the result.
            const scrollPromise = page.evaluate(
                ({ timeoutMs }) => {
                    return new Promise<{ baseline: number; final: number }>((resolve) => {
                        const baseline = window.scrollY;
                        let resolved = false;
                        const listener = () => {
                            if (resolved) return;
                            resolved = true;
                            window.removeEventListener('scroll', listener);
                            resolve({ baseline, final: window.scrollY });
                        };
                        window.addEventListener('scroll', listener);
                        setTimeout(() => {
                            if (!resolved) {
                                resolved = true;
                                window.removeEventListener('scroll', listener);
                                resolve({ baseline, final: window.scrollY });
                            }
                        }, timeoutMs);
                    });
                },
                { timeoutMs: 2000 },
            );

            await page.keyboard.press('j');
            const { baseline, final } = await scrollPromise;

            const valueAfter = await page.evaluate(() => (document.querySelector('#text-input-1') as HTMLInputElement).value);
            if (DEBUG) console.log(`Scroll: ${baseline}px → ${final}px (scrollBefore=${scrollBefore}), input value before="${valueBefore}" after="${valueAfter}"`);

            // The letter 'j' must NOT have been appended to the input value
            // (that would indicate we're still in insert mode)
            expect(valueAfter).toBe(valueBefore);

            // The page should have scrolled — if it doesn't, normal mode is not active
            // This is the regression assertion: ESC must fully restore normal mode
            expect(final).toBeGreaterThan(baseline);

            // Cleanup spacer
            await page.evaluate(() => document.getElementById('scroll-spacer')?.remove());
        });
    });

    test('cmd_insert_exit is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Focus an input to enter insert mode, then invoke exit
            await page.click('#text-input-1');
            await page.waitForTimeout(200);

            const ok = await invokeCommand(page, 'cmd_insert_exit');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);
        });
    });
});
