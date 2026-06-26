/**
 * Scratch test: v key with REAL config loaded (port 9601)
 *
 * Uses a custom extension build (chrome-test9601) hardcoded to port 9601,
 * which serves the real ~/.surfingkeys-2026.js (with vmapkey fix applied).
 *
 * Goal conditions:
 *   1. Normal mode  v → passthrough:  pressing v does NOT enter visual mode
 *   2. Visual mode  v → toggle:       pressing v in caret mode + moving = selection
 *
 * Config load detection: default v = visual toggle (cursor appears).
 * After real config loads, v = passthrough (no cursor). Poll until that flips.
 *
 * Build:
 *   CONFIG_SERVER_PORT=9601 BUILD_SUFFIX=-test9601 node ./config/esbuild.config.js development
 *
 * Usage:
 *   bunx playwright test tests/playwright/scratch/scratch-visual-v-real-config.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;
const REAL_CONFIG_EXT = path.resolve(__dirname, '../../../dist/development/chrome-test9601');
const EXTENSION_ID    = 'aajlcoiaogpknhgninhopncaldipjdnp';

async function launchWithRealConfig(): Promise<{ context: BrowserContext }> {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-real-cfg-'));
    fs.mkdirSync(path.join(userDataDir, 'Default'), { recursive: true });
    fs.writeFileSync(
        path.join(userDataDir, 'Default', 'Preferences'),
        JSON.stringify({ extensions: { ui: { developer_mode: true } } }),
    );
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            '--headless=new',
            `--disable-extensions-except=${REAL_CONFIG_EXT}`,
            `--load-extension=${REAL_CONFIG_EXT}`,
            '--enable-experimental-extension-apis',
            '--enable-features=UserScriptsAPI',
            '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
            '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
        ],
        viewport: { width: 1280, height: 720 },
    });
    return { context };
}

/**
 * Wait for the real config to be applied by polling v's behavior.
 * Default extension: v = cmd_visual_toggle → cursor appears.
 * Real config:       v = passthrough        → no cursor.
 * Returns when no cursor is seen after pressing v (= real config active).
 */
async function waitForRealConfig(page: Page, timeoutMs = 15000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await page.mouse.click(400, 200);
        await page.waitForTimeout(150);
        await page.keyboard.press('v');
        await page.waitForTimeout(400);
        const cursorVisible = await page.locator('.surfingkeys_cursor').isVisible();
        if (!cursorVisible) return; // real config active — passthrough bound to v
        // Still on default (visual mode entered) — press Escape and wait
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
    }
    throw new Error('Real config did not apply within timeout');
}

let context: BrowserContext;
let page: Page;

test.describe('v key with real config (port 9601)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchWithRealConfig());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(1000);
        await waitForRealConfig(page);
        console.log('[setup] real config confirmed loaded');
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(100);
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(100);
    });

    // ── Condition 1 ───────────────────────────────────────────────────────────
    test('Normal mode: v = passthrough — does not enter visual mode', async () => {
        await page.mouse.click(400, 200);
        await page.waitForTimeout(200);

        await page.keyboard.press('v');
        await page.waitForTimeout(400);

        const cursorVisible = await page.locator('.surfingkeys_cursor').isVisible();
        console.log('[cond1] cursor visible after v:', cursorVisible);
        expect(cursorVisible).toBe(false);
    });

    // ── Condition 2 ───────────────────────────────────────────────────────────
    test('Visual mode: v in caret mode starts selection', async () => {
        // Place DOM caret on #line2, enter visual caret mode via invokeCommand
        await page.evaluate(() => {
            const elem = document.querySelector('#line2') as HTMLElement;
            if (elem?.firstChild) {
                const range = document.createRange();
                range.setStart(elem.firstChild, 0);
                range.collapse(true);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        await invokeCommand(page, 'cmd_visual_restore');
        await page.waitForTimeout(300);

        // Confirm caret mode: cursor visible, no selection
        await expect(page.locator('.surfingkeys_cursor')).toBeVisible({ timeout: 5000 });
        const selBefore = await page.evaluate(() => window.getSelection()?.toString() ?? '');
        expect(selBefore).toBe('');

        // Press v — real config has vmapkey binding: v → cmd_visual_toggle in visual mode
        await page.keyboard.press('v');
        await page.waitForTimeout(200);

        // Extend selection
        await invokeCommand(page, 'cmd_visual_forward_char');
        await invokeCommand(page, 'cmd_visual_forward_char');
        await invokeCommand(page, 'cmd_visual_forward_char');
        await page.waitForTimeout(200);

        const selAfter = await page.evaluate(() => window.getSelection()?.toString() ?? '');
        console.log('[cond2] selection after v + forward chars:', JSON.stringify(selAfter));
        expect(selAfter.length).toBeGreaterThan(0);
    });
});
