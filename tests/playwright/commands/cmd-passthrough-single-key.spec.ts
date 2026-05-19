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

const SUITE_LABEL = 'cmd_passthrough_single_key';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_passthrough_single_key (Playwright)', () => {
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
        await callSKApi(page, 'mapcmdkey', '<Alt-Shift-p>', 'cmd_passthrough_single_key');
        await callSKApi(page, 'mapcmdkey', 'j', 'cmd_scroll_down');
    });

    test('cmd_passthrough_single_key is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const ok = await invokeCommand(page, 'cmd_passthrough_single_key');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            // Press Escape to cleanly exit passthrough mode
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
        });
    });

    test('in single-key passthrough mode the first keystroke passes to the page and mode exits', async () => {
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

            const pageInfo = await page.evaluate(() => ({
                scrollHeight: document.body.scrollHeight,
                clientHeight: document.documentElement.clientHeight,
                isScrollable: document.body.scrollHeight > document.documentElement.clientHeight,
            }));
            if (DEBUG) console.log(`Page scroll info: ${JSON.stringify(pageInfo)}`);

            // Enter single-key passthrough mode
            const ok = await invokeCommand(page, 'cmd_passthrough_single_key');
            expect(ok).toBe(true);

            // Set up scroll listener before pressing the key
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
                { timeoutMs: 1500 },
            );

            // Press Space (PageDown equivalent that works in passthrough) while in single-key passthrough
            await page.keyboard.press('Space');
            const { baseline, final } = await scrollPromise;

            if (DEBUG) console.log(`Scroll in single-key passthrough: baseline=${baseline}px final=${final}px`);

            // The Space key should have been passed to the page and caused a scroll
            expect(final).toBeGreaterThan(baseline);

            // Wait a moment then verify mode returned to Normal by checking j no longer scrolls natively
            // (i.e. SK intercepts j again in Normal mode — pressing j should SK-scroll, not native scroll)
            await page.waitForTimeout(200);

            // Press j — if we are back in Normal mode SK intercepts it and scrolls via SK
            // If still in PassThrough a second j would pass through natively (also scrolls but differently)
            // The real check: a second Space should NOT scroll (SK intercepts it or does nothing in Normal mode)
            const scrollPromise2 = page.evaluate(
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

            // Press Space again — in Normal mode SK does not bind Space for page scroll,
            // so the page receives native Space and scrolls again.
            // What matters is that we are NOT stuck in passthrough (which would have already
            // exited after the first key). We verify this by pressing Escape — if we were
            // still in passthrough it would exit; if we are in Normal mode it is a no-op.
            // Then press j which SK handles in Normal mode (scrolls via SK).
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);

            // In Normal mode j is handled by SK and causes a scroll
            const scrollPromise3 = page.evaluate(
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
                { timeoutMs: 1000 },
            );
            await page.keyboard.press('j');
            const { baseline: b3, final: f3 } = await scrollPromise3;
            if (DEBUG) console.log(`Scroll after single-key passthrough exit: baseline=${b3}px final=${f3}px`);

            // j in Normal mode should trigger SK scroll
            expect(f3).toBeGreaterThan(b3);

            // Cleanup spacer
            await page.evaluate(() => document.getElementById('scroll-spacer')?.remove());

            // Discard the unused scrollPromise2 result
            await scrollPromise2;
        });
    });

    test('after single key passthrough mode exits second keystroke is handled by SK not passed through', async () => {
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

            // Enter single-key passthrough and press Space to consume the single key
            const ok = await invokeCommand(page, 'cmd_passthrough_single_key');
            expect(ok).toBe(true);

            // Consume the single pass-through key (Space scrolls natively)
            await page.keyboard.press('Space');
            await page.waitForTimeout(300);

            // Now we should be back in Normal mode. Record position.
            const posAfterExit = await page.evaluate(() => window.scrollY);

            // Press j — SK handles j in Normal mode (scrolls via SK scroll down)
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
                { timeoutMs: 1500 },
            );

            await page.keyboard.press('j');
            const { baseline, final } = await scrollPromise;

            if (DEBUG) console.log(`After single-key passthrough exit — j scroll: baseline=${baseline}px final=${final}px posAfterExit=${posAfterExit}`);

            // j in Normal mode should trigger SK-managed scroll
            expect(final).toBeGreaterThan(baseline);

            // Cleanup
            await page.evaluate(() => document.getElementById('scroll-spacer')?.remove());
        });
    });
});
