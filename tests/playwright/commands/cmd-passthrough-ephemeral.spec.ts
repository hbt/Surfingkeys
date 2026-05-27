import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
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

const SUITE_LABEL = 'cmd_passthrough_ephemeral';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_passthrough_ephemeral (Playwright)', () => {
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
        // Scroll to top and wait briefly to reset state between tests
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
        // Press Escape to ensure we start in normal mode
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', 'p', 'cmd_passthrough_ephemeral');
        await callSKApi(page, 'mapcmdkey', 'j', 'cmd_scroll_down');
    });

    test('cmd_passthrough_ephemeral is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const ok = await invokeCommand(page, 'cmd_passthrough_ephemeral');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            // Let the 1000ms timer expire so mode resets cleanly before next test
            await page.waitForTimeout(1100);
        });
    });

    test('in ephemeral passthrough mode j key does not scroll', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Add a tall spacer so there is room to scroll
            await page.evaluate(() => {
                const spacer = document.createElement('div');
                spacer.id = 'scroll-spacer';
                spacer.style.height = '3000px';
                document.body.appendChild(spacer);
            });

            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(100);

            const pageInfo = await page.evaluate(() => ({
                scrollHeight: document.body.scrollHeight,
                clientHeight: document.documentElement.clientHeight,
                isScrollable: document.body.scrollHeight > document.documentElement.clientHeight,
            }));
            if (DEBUG) console.log(`Page scroll info: ${JSON.stringify(pageInfo)}`);

            // Enter ephemeral passthrough mode (auto-exits after 1000ms)
            const ok = await invokeCommand(page, 'cmd_passthrough_ephemeral');
            expect(ok).toBe(true);

            // Immediately set up scroll listener and press j (while still in passthrough)
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
                { timeoutMs: 800 },
            );

            await page.keyboard.press('j');
            const { baseline, final } = await scrollPromise;

            if (DEBUG) console.log(`Scroll in ephemeral passthrough: baseline=${baseline}px final=${final}px`);

            // SK suppresses j while in ephemeral passthrough — page must NOT scroll
            expect(final).toBe(baseline);

            // Let the timer expire to cleanly return to normal mode
            await page.waitForTimeout(1100);

            // Cleanup
            await page.evaluate(() => document.getElementById('scroll-spacer')?.remove());
        });
    });

    test('after 1100ms ephemeral passthrough auto-exits and j scrolls normally', async () => {
        test.setTimeout(10000);

        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Add a tall spacer so there is room to scroll
            await page.evaluate(() => {
                const spacer = document.createElement('div');
                spacer.id = 'scroll-spacer';
                spacer.style.height = '3000px';
                document.body.appendChild(spacer);
            });

            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(100);

            // Enter ephemeral passthrough mode
            const ok = await invokeCommand(page, 'cmd_passthrough_ephemeral');
            expect(ok).toBe(true);

            // Wait for the 1000ms auto-exit timer to fire, with a small buffer
            await page.waitForTimeout(1100);

            // Now in normal mode — j should scroll
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

            if (DEBUG) console.log(`Scroll after auto-exit: baseline=${baseline}px final=${final}px`);

            // Normal mode restored after auto-exit: j must scroll
            expect(final).toBeGreaterThan(baseline);

            // Cleanup
            await page.evaluate(() => document.getElementById('scroll-spacer')?.remove());
        });
    });
});
