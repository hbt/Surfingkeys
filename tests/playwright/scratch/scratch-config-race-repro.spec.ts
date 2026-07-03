/**
 * Deterministic repro: default keybindings fire before custom config/snippets
 * are applied, on the TOP frame, because mode.ts's keydown guard
 * (`mode_stack.length === 0 && window !== top`) only defers for iframes —
 * see content.ts:187 (normal.enter() pushes default mappings synchronously)
 * vs content.ts:267-277 (custom config/snippets applied asynchronously after
 * RUNTIME('getSettings') resolves).
 *
 * To make the race deterministic instead of timing-flaky, this test points
 * at a dedicated extension build (chrome-test9603) whose config server
 * artificially delays /config by 2000ms (CONFIG_RESPONSE_DELAY_MS). The served
 * config (test-config-race.js) unmaps 'j' (default: scroll down).
 *
 * Build:
 *   CONFIG_SERVER_PORT=9603 BUILD_SUFFIX=-test9603 node ./config/esbuild.config.js development
 * Server:
 *   PORT=9603 CONFIG_FILE=data/fixtures/test-config-race.js CONFIG_RESPONSE_DELAY_MS=2000 bun scripts/server.ts
 *
 * Usage:
 *   bunx playwright test tests/playwright/scratch/scratch-config-race-repro.spec.ts \
 *     --config=playwright.scratch.config.ts
 */
import { test, expect, BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const RACE_CONFIG_EXT = path.resolve(__dirname, '../../../dist/development/chrome-test9603');

async function launchWithRaceConfig(): Promise<{ context: BrowserContext }> {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-race-cfg-'));
    fs.mkdirSync(path.join(userDataDir, 'Default'), { recursive: true });
    fs.writeFileSync(
        path.join(userDataDir, 'Default', 'Preferences'),
        JSON.stringify({ extensions: { ui: { developer_mode: true } } }),
    );
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            '--headless=new',
            `--disable-extensions-except=${RACE_CONFIG_EXT}`,
            `--load-extension=${RACE_CONFIG_EXT}`,
            '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
            '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
        ],
        viewport: { width: 1280, height: 2000 },
    });
    return { context };
}

test('top-frame keydown fires default "j" scroll before delayed custom config unmaps it', async () => {
    const { context } = await launchWithRaceConfig();
    const page: Page = await context.newPage();

    await page.goto(FIXTURE_URL, { waitUntil: 'load' });

    // Fire immediately — well inside the artificial 2000ms /config delay window,
    // so custom config (which unmaps 'j') cannot have been applied yet.
    await page.keyboard.press('j');
    await page.waitForTimeout(200); // let the default scroll handler run

    const scrollYEarly = await page.evaluate(() => window.scrollY);
    const raceConfigAppliedEarly = await page.evaluate(() => document.documentElement.dataset.skRaceConfigApplied);
    console.log(`[race] scrollY after early 'j'=${scrollYEarly}, configApplied=${raceConfigAppliedEarly}`);

    // Proves the race: default binding fired (page scrolled) even though this
    // build's custom config unmaps 'j' — because custom config hadn't landed yet.
    expect(scrollYEarly).toBeGreaterThan(0);
    expect(raceConfigAppliedEarly).not.toBe('true');

    // MV3 detail: api.unmap('j') in the config text is registered via
    // chrome.userScripts.register (background), which only takes effect on the
    // NEXT navigation — not retroactively on the already-open page. So confirm
    // eventual application via a reload, well past the 2000ms artificial delay.
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
        () => document.documentElement.dataset.skRaceConfigApplied === 'true',
        { timeout: 5000 },
    );

    const scrollYBeforeSecondPress = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('j');
    await page.waitForTimeout(300);
    const scrollYAfterSecondPress = await page.evaluate(() => window.scrollY);
    console.log(`[race] scrollY before/after second 'j' (post-reload, config registered)=${scrollYBeforeSecondPress}/${scrollYAfterSecondPress}`);

    // Proves custom config took effect on the reloaded page: 'j' is unmapped, no further scroll.
    expect(scrollYAfterSecondPress).toBe(scrollYBeforeSecondPress);

    await context.close();
});
