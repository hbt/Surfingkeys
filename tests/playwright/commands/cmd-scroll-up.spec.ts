import { test, expect, chromium, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/development/chrome');
const FIXTURE_URL = 'http://127.0.0.1:9873/scroll-test.html';

let context: BrowserContext;
let page: Page;

/**
 * Send a key press and wait for a scroll event that moves at least `minDelta` px
 * in the given direction.  Returns { baseline, final, delta }.
 */
async function sendKeyAndWaitForScroll(
    page: Page,
    key: string,
    opts: { direction: 'up' | 'down'; minDelta: number; timeoutMs?: number },
): Promise<{ baseline: number; final: number; delta: number }> {
    const timeoutMs = opts.timeoutMs ?? 5000;

    // 1. Inject a scroll listener BEFORE pressing the key (mirrors the CDP
    //    atomic pattern from event-driven-waits.ts).
    const scrollPromise = page.evaluate(
        ({ direction, minDelta, timeoutMs }) => {
            return new Promise<{ baseline: number; final: number }>((resolve) => {
                const baseline = window.scrollY;
                let resolved = false;

                const listener = () => {
                    if (resolved) return;
                    const current = window.scrollY;
                    const delta =
                        direction === 'up' ? baseline - current : current - baseline;
                    if (delta >= minDelta) {
                        resolved = true;
                        window.removeEventListener('scroll', listener);
                        resolve({ baseline, final: current });
                    }
                };

                window.addEventListener('scroll', listener);

                // Failsafe timeout
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        window.removeEventListener('scroll', listener);
                        resolve({ baseline, final: window.scrollY });
                    }
                }, timeoutMs);
            });
        },
        { direction: opts.direction, minDelta: opts.minDelta, timeoutMs },
    );

    // 2. Press the key (Playwright dispatches real OS-level input events).
    await page.keyboard.press(key);

    // 3. Wait for the scroll to complete.
    const { baseline, final: finalPos } = await scrollPromise;

    const delta =
        opts.direction === 'up' ? baseline - finalPos : finalPos - baseline;

    return { baseline, final: finalPos, delta };
}

test.describe('cmd_scroll_up (Playwright)', () => {
    test.beforeAll(async () => {
        // Create a temporary user-data dir with developer_mode enabled.
        const userDataDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pw-ext-test-'),
        );
        const defaultDir = path.join(userDataDir, 'Default');
        fs.mkdirSync(defaultDir, { recursive: true });
        fs.writeFileSync(
            path.join(defaultDir, 'Preferences'),
            JSON.stringify({
                extensions: { ui: { developer_mode: true } },
            }),
        );

        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                '--headless=new',
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`,
                '--enable-experimental-extension-apis',
                '--enable-features=UserScriptsAPI',
                '--disable-gpu',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-background-networking',
                '--disable-sync',
                '--no-pings',
                '--metrics-recording-only',
            ],
        });

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        // Let Surfingkeys content script settle.
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
    });
});
