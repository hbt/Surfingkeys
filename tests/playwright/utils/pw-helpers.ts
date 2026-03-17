/**
 * Shared Playwright helpers for Chrome extension (MV3) tests.
 * Used by all spec files under tests/playwright/commands/.
 */

import { chromium, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/development/chrome');
export const FIXTURE_BASE = 'http://127.0.0.1:9873';

/**
 * Launch a persistent Chrome context with the Surfingkeys extension loaded.
 * Creates a temp user-data dir with developer_mode enabled.
 */
export async function launchExtensionContext(opts?: { headless?: boolean }): Promise<{
    context: BrowserContext;
    userDataDir: string;
}> {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-test-'));
    const defaultDir = path.join(userDataDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(
        path.join(defaultDir, 'Preferences'),
        JSON.stringify({ extensions: { ui: { developer_mode: true } } }),
    );

    const headless = opts?.headless ?? true;

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            ...(headless ? ['--headless=new'] : []),
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

    return { context, userDataDir };
}

/**
 * Navigate to a URL and wait for Surfingkeys content script to settle.
 */
export async function waitForSKReady(page: import('@playwright/test').Page, settleMs = 500): Promise<void> {
    await page.waitForTimeout(settleMs);
}

/**
 * Wait for the page to reach load state.
 */
export async function waitForPageNavigation(
    page: import('@playwright/test').Page,
    timeoutMs = 10000,
): Promise<void> {
    await page.waitForLoadState('load', { timeout: timeoutMs });
}

/**
 * Send a key press and wait for a scroll event that moves at least `minDelta` px
 * in the given direction.  Returns { baseline, final, delta }.
 */
export async function sendKeyAndWaitForScroll(
    page: import('@playwright/test').Page,
    key: string,
    opts: {
        direction: 'up' | 'down' | 'left' | 'right';
        minDelta: number;
        timeoutMs?: number;
    },
): Promise<{ baseline: number; final: number; delta: number }> {
    const timeoutMs = opts.timeoutMs ?? 5000;
    const isHorizontal = opts.direction === 'left' || opts.direction === 'right';

    const scrollPromise = page.evaluate(
        ({ direction, minDelta, timeoutMs, isHorizontal }) => {
            return new Promise<{ baseline: number; final: number }>((resolve) => {
                const baseline = isHorizontal ? window.scrollX : window.scrollY;
                let resolved = false;

                const listener = () => {
                    if (resolved) return;
                    const current = isHorizontal ? window.scrollX : window.scrollY;
                    const delta =
                        direction === 'up' || direction === 'left'
                            ? baseline - current
                            : current - baseline;
                    if (delta >= minDelta) {
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
                        resolve({ baseline, final: isHorizontal ? window.scrollX : window.scrollY });
                    }
                }, timeoutMs);
            });
        },
        { direction: opts.direction, minDelta: opts.minDelta, timeoutMs, isHorizontal },
    );

    await page.keyboard.press(key);

    const { baseline, final: finalPos } = await scrollPromise;

    const delta =
        opts.direction === 'up' || opts.direction === 'left'
            ? baseline - finalPos
            : finalPos - baseline;

    return { baseline, final: finalPos, delta };
}
