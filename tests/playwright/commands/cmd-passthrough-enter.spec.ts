import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_passthrough_enter';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_passthrough_enter (Playwright)', () => {
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
        // Press Escape to ensure we start in normal mode (exit any lingering passthrough)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
    });

    test('cmd_passthrough_enter is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            const ok = await invokeCommand(page, 'cmd_passthrough_enter');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);

            // Exit passthrough so subsequent tests start in normal mode
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
        });
    });

    test('in passthrough mode j key does not scroll', async () => {
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

            // Enter passthrough mode
            const ok = await invokeCommand(page, 'cmd_passthrough_enter');
            expect(ok).toBe(true);
            await page.waitForTimeout(100);

            // Set up scroll listener before pressing j, then await result
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
                { timeoutMs: 1000 },
            );

            await page.keyboard.press('j');
            const { baseline, final } = await scrollPromise;

            if (DEBUG) console.log(`Scroll in passthrough: baseline=${baseline}px final=${final}px`);

            // SK suppresses j in passthrough mode — page must NOT scroll
            expect(final).toBe(baseline);

            // Cleanup
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
            await page.evaluate(() => document.getElementById('scroll-spacer')?.remove());
        });
    });

    test('pressing Escape exits passthrough and restores normal mode', async () => {
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

            // Enter passthrough mode
            const ok = await invokeCommand(page, 'cmd_passthrough_enter');
            expect(ok).toBe(true);
            await page.waitForTimeout(100);

            // Press j — should NOT scroll (passthrough suppresses SK)
            const scrollPromise1 = page.evaluate(
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
            const { baseline: baseline1, final: final1 } = await scrollPromise1;

            if (DEBUG) console.log(`Scroll in passthrough: baseline=${baseline1}px final=${final1}px`);
            // Passthrough mode: j must not scroll
            expect(final1).toBe(baseline1);

            // Press Escape — exits passthrough mode
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);

            // Press j again — SK is active again so page should scroll
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
                { timeoutMs: 2000 },
            );

            await page.keyboard.press('j');
            const { baseline: baseline2, final: final2 } = await scrollPromise2;

            if (DEBUG) console.log(`Scroll after Escape: baseline=${baseline2}px final=${final2}px`);
            // Normal mode restored: j must scroll
            expect(final2).toBeGreaterThan(baseline2);

            // Cleanup
            await page.evaluate(() => document.getElementById('scroll-spacer')?.remove());
        });
    });
});
