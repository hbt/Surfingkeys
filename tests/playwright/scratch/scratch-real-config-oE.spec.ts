/**
 * Scratch test: oE (cmd_omnibar_extract_entities) with REAL config loaded (port 9601)
 *
 * Diagnoses the reported "oE does nothing in gchrb" symptom.
 *
 * Hypothesis (found by reading ~/.surfingkeys-2026.js):
 *   Line 28 calls `api.unmapAllExcept([]);` which wipes every default Normal-mode
 *   key binding (the trie), then the config re-declares only the bindings it lists
 *   explicitly. `oE` / cmd_omnibar_extract_entities is never re-declared anywhere
 *   in the file, so under the real config the key is simply unbound.
 *
 *   unmapAllExcept only replaces `mode.mappings` (the trie) — it does NOT touch
 *   `commandRegistry` (see src/content_scripts/common/api.ts:255-273 vs :84-95).
 *   So the command should still be invocable via invokeCommand() (commandRegistry
 *   lookup) even though the real physical key press does nothing (trie lookup
 *   finds no match).
 *
 * This test proves that split:
 *   1. Pressing o then E does NOT open the omnibar and emits no oE.keyTriggered
 *      otel span (trie dispatch never reaches the handler).
 *   2. invokeCommand(page, 'cmd_omnibar_extract_entities') still opens the omnibar
 *      fine (commandRegistry entry survives unmapAllExcept).
 *
 * Build (only if dist/development/chrome-test9601 predates a source change):
 *   CONFIG_SERVER_PORT=9601 BUILD_SUFFIX=-test9601 node ./config/esbuild.config.js development
 *
 * Usage:
 *   bunx playwright test tests/playwright/scratch/scratch-real-config-oE.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/extract-page-entities.html`;
const REAL_CONFIG_EXT = path.resolve(__dirname, '../../../dist/development/chrome-test9601');
const REAL_CONFIG_PORT = 9601;
const REAL_CONFIG_FILE = '/home/hassen/.surfingkeys-2026.js';
const OTEL_LOG_FILE = '/tmp/sk-otel.jsonl';

async function launchWithRealConfig(): Promise<{ context: BrowserContext }> {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-real-cfg-oE-'));
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

async function waitForConfigServer(port: number, timeoutMs = 10000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const resp = await fetch(`http://localhost:${port}/config`);
            if (resp.ok) return;
        } catch (_) { /* not up yet */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Config server on :${port} did not come up within ${timeoutMs}ms`);
}

/**
 * Wait for the real config to be applied by polling v's behavior (same technique as
 * scratch-visual-v-real-config.spec.ts). The `skConfigServerLoaded` DOM marker only
 * gets set by the FIXTURE config's user script (data/fixtures/test-config-server.js)
 * — the real ~/.surfingkeys-2026.js has no such marker, so it can't be used here.
 * Default extension: v = cmd_visual_toggle → cursor appears.
 * Real config:       v = passthrough        → no cursor.
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
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
    }
    throw new Error('Real config did not apply within timeout');
}

/** Read otel spans appended to OTEL_LOG_FILE strictly after `sinceLineCount` lines. */
function readNewOtelSpans(sinceLineCount: number): any[] {
    if (!fs.existsSync(OTEL_LOG_FILE)) return [];
    const lines = fs.readFileSync(OTEL_LOG_FILE, 'utf8').split('\n').filter(Boolean);
    return lines.slice(sinceLineCount).map(l => {
        try { return JSON.parse(l); } catch (_) { return null; }
    }).filter(Boolean);
}

function otelLineCount(): number {
    if (!fs.existsSync(OTEL_LOG_FILE)) return 0;
    return fs.readFileSync(OTEL_LOG_FILE, 'utf8').split('\n').filter(Boolean).length;
}

async function isOmnibarOpen(p: Page): Promise<boolean> {
    return p.evaluate(() => {
        const divs = document.querySelectorAll('div');
        for (const div of Array.from(divs)) {
            if (div.shadowRoot) {
                const iframe = div.shadowRoot.querySelector('iframe.sk_ui');
                if (iframe) {
                    const h = (iframe as HTMLElement).style.height;
                    return h !== '0px' && h !== '';
                }
            }
        }
        return false;
    });
}

let context: BrowserContext;
let page: Page;
let configServer: ChildProcess;

test.describe('oE with real config (port 9601)', () => {
    test.describe.configure({ timeout: 60000 });

    test.beforeAll(async () => {
        configServer = spawn('bun', ['scripts/server.ts'], {
            cwd: path.resolve(__dirname, '../../..'),
            env: { ...process.env, PORT: String(REAL_CONFIG_PORT), CONFIG_FILE: REAL_CONFIG_FILE },
            stdio: 'ignore',
        });
        await waitForConfigServer(REAL_CONFIG_PORT);

        ({ context } = await launchWithRealConfig());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(1000);
        await waitForRealConfig(page);
        console.log('[setup] real config confirmed loaded on :9601');
    });

    test.afterAll(async () => {
        await context?.close();
        configServer?.kill();
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(150);
    });

    test('real config unbinds oE: key press opens nothing, no oE.keyTriggered span', async () => {
        const baseline = otelLineCount();

        await page.mouse.click(400, 200);
        await page.waitForTimeout(100);
        await page.keyboard.press('o');
        await page.waitForTimeout(80);
        await page.keyboard.press('E');
        await page.waitForTimeout(400);

        const open = await isOmnibarOpen(page);
        console.log('[diagnose] omnibar open after o,E key press:', open);
        expect(open).toBe(false);

        const newSpans = readNewOtelSpans(baseline);
        const keyTriggered = newSpans.filter(s => s.name === 'oE.keyTriggered');
        console.log('[diagnose] new oE.keyTriggered spans since key press:', keyTriggered.length);
        expect(keyTriggered.length).toBe(0);
    });

    test('commandRegistry survives unmapAllExcept: invokeCommand still opens the omnibar', async () => {
        const baseline = otelLineCount();

        const ok = await invokeCommand(page, 'cmd_omnibar_extract_entities');
        console.log('[diagnose] invokeCommand result:', ok);
        expect(ok).toBe(true);

        await page.waitForTimeout(300);
        const open = await isOmnibarOpen(page);
        console.log('[diagnose] omnibar open after invokeCommand:', open);
        expect(open).toBe(true);

        const newSpans = readNewOtelSpans(baseline);
        const triggered = newSpans.some(s => s.name === 'oE.keyTriggered');
        const opened = newSpans.some(s => s.name === 'oE.PageEntities.onOpen');
        console.log('[diagnose] spans via invokeCommand — keyTriggered:', triggered, 'onOpen:', opened);
        expect(triggered).toBe(true);
        expect(opened).toBe(true);
    });
});
