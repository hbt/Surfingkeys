import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, sendKeyAndWaitForScroll, FIXTURE_BASE, collectOptionalCoverage } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let cdpPort: number | undefined;

test.describe('cmd_scroll_up (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchExtensionContext({ enableCoverage: process.env.COVERAGE === 'true' });
        context = result.context;
        cdpPort = result.cdpPort;

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.beforeEach(async () => {
        // Scroll to near bottom so there is room to scroll up.
        await page.evaluate(() => {
            window.scrollTo(
                0,
                Math.max(
                    500,
                    document.body.scrollHeight - window.innerHeight - 200,
                ),
            );
        });
        await page.waitForTimeout(200);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing k key scrolls page up', async () => {
        const initialScroll = await page.evaluate(() => window.scrollY);
        expect(initialScroll).toBeGreaterThan(0);

        const result = await sendKeyAndWaitForScroll(page, 'k', {
            direction: 'up',
            minDelta: 20,
        });

        expect(result.final).toBeLessThan(result.baseline);
        console.log(
            `Scroll: ${result.baseline}px → ${result.final}px (delta: ${result.delta}px)`,
        );

        await collectOptionalCoverage(cdpPort, page);
    });

    test('scroll up distance is consistent', async () => {
        const start = await page.evaluate(() => window.scrollY);
        expect(start).toBeGreaterThan(0);

        const result1 = await sendKeyAndWaitForScroll(page, 'k', {
            direction: 'up',
            minDelta: 20,
        });
        const result2 = await sendKeyAndWaitForScroll(page, 'k', {
            direction: 'up',
            minDelta: 20,
        });

        console.log(
            `1st scroll: ${result1.delta}px, 2nd scroll: ${result2.delta}px, diff: ${Math.abs(result1.delta - result2.delta)}px`,
        );
        expect(Math.abs(result1.delta - result2.delta)).toBeLessThan(15);

        await collectOptionalCoverage(cdpPort, page);
    });
});
