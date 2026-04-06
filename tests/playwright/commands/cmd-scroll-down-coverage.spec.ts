import { test, expect } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE, collectCDPCoverage, sendKeyAndWaitForScroll } from '../utils/pw-helpers';
import { collectV8Coverage, calculateCoverageStats } from '../utils/cdp-coverage';
import { Page } from '@playwright/test';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

/**
 * Template: Scroll command test WITH optional V8 coverage collection
 *
 * Usage:
 *   bunx playwright test cmd-scroll-down-coverage.spec.ts                    # Run without coverage (fast)
 *   COVERAGE=true bunx playwright test cmd-scroll-down-coverage.spec.ts      # Run with coverage (slow)
 *
 * This demonstrates how to migrate from old CDP tests to Playwright
 * while preserving the ability to collect V8 code coverage when needed.
 */

const COLLECT_COVERAGE = process.env.COVERAGE === 'true';

test.describe('cmd_scroll_down (with optional coverage)', () => {
    test('pressing j key scrolls page down', async () => {
        const { context, cdpPort } = await launchExtensionContext({
            enableCoverage: COLLECT_COVERAGE,
        });

        const page: Page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        // Reset scroll
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);

        // Test: pressing j key scrolls page down
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBe(0);

        const result = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        expect(result.final).toBeGreaterThan(result.baseline);

        console.log(`Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`);

        // Collect coverage if enabled
        if (COLLECT_COVERAGE && cdpPort) {
            await collectCoverageReport(cdpPort);
        }

        await context.close();
    });

    test('scroll down distance is consistent', async () => {
        const { context, cdpPort } = await launchExtensionContext({
            enableCoverage: COLLECT_COVERAGE,
        });

        const page: Page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);

        // Test: scroll distance is consistent
        const result1 = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        const result2 = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });

        console.log(`1st: ${result1.delta}px, 2nd: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`);
        expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(15);

        // Collect coverage if enabled
        if (COLLECT_COVERAGE && cdpPort) {
            await collectCoverageReport(cdpPort);
        }

        await context.close();
    });

    test('pressing 5j scrolls 5 times the distance of j', async () => {
        const { context, cdpPort } = await launchExtensionContext({
            enableCoverage: COLLECT_COVERAGE,
        });

        const page: Page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);

        // Test: 5j scrolls roughly 5x the distance
        const result1 = await sendKeyAndWaitForScroll(page, 'j', { direction: 'down', minDelta: 20 });
        const singleDistance = result1.delta;

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);

        const scrollPromise = page.evaluate(
            ({ minDelta, timeoutMs }) => {
                return new Promise<{ baseline: number; final: number }>((resolve) => {
                    const baseline = window.scrollY;
                    let resolved = false;
                    const listener = () => {
                        if (resolved) return;
                        const current = window.scrollY;
                        if (current - baseline >= minDelta) {
                            resolved = true;
                            window.removeEventListener('scroll', listener);
                            resolve({ baseline, final: current });
                        }
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
            { minDelta: singleDistance * 3, timeoutMs: 5000 },
        );

        await page.keyboard.press('5');
        await page.keyboard.press('j');

        const { baseline, final } = await scrollPromise;
        const repeatDistance = final - baseline;
        const ratio = repeatDistance / singleDistance;

        console.log(`Single j: ${singleDistance}px, 5j: ${repeatDistance}px (ratio: ${ratio.toFixed(2)}x)`);
        expect(ratio).toBeGreaterThanOrEqual(3.5);
        expect(ratio).toBeLessThanOrEqual(6.5);

        // Collect coverage if enabled
        if (COLLECT_COVERAGE && cdpPort) {
            await collectCoverageReport(cdpPort);
        }

        await context.close();
    });
});

/**
 * Helper: Collect and report V8 coverage
 */
async function collectCoverageReport(cdpPort: number) {
    console.log('\n--- V8 Coverage Report ---');

    const targets = await collectCDPCoverage(cdpPort);
    const pageTarget = targets.find((t: any) => t.type === 'page' && t.url?.includes('scroll-test'));

    if (!pageTarget?.webSocketDebuggerUrl) {
        console.log('(Coverage: page target not found)');
        return;
    }

    // Start coverage collection
    const coveragePromise = collectV8Coverage(pageTarget.webSocketDebuggerUrl, 10000);

    // Wait a bit for any remaining code execution
    await new Promise(r => setTimeout(r, 200));

    const coverage = await coveragePromise;

    if (!coverage || coverage.length === 0) {
        console.log('(Coverage: no data)');
        return;
    }

    const stats = calculateCoverageStats(coverage);
    console.log(`Coverage: ${stats.percentage}% (${stats.coveredBytes}/${stats.totalBytes} bytes)`);
    console.log('Scripts:');
    Object.entries(stats.byUrl).forEach(([url, data]: any) => {
        const pct = data.total > 0 ? ((data.covered / data.total) * 100).toFixed(1) : '0';
        console.log(`  ${pct}% | ${url.substring(0, 70)}`);
    });
}
