/**
 * Config server debug — step by step.
 *
 * Run with:
 *   COVERAGE=true bunx playwright test tests/playwright/commands/cmd-config-server-debug.spec.ts --reporter=line
 *
 * Steps:
 *   1. GET /config returns 200 with real config content (no browser).
 *   2. SW startup coverage — which background.js functions ran during startup.
 *      Specifically: did ensureSettingsSnippetRegistration / syncSettingsSnippets fire?
 */
import { test, expect } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import { readCoverageStats } from '../utils/coverage-utils';

const CONFIG_URL = 'http://localhost:9600/config';
const REAL_CONFIG_MARKER = 'settings.newTabUrl';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

// ─── Step 1: server responds with real config ──────────────────────────────────
test('step 1 — GET /config returns 200 with real config content', async ({ request }) => {
    const resp = await request.get(CONFIG_URL);
    expect(resp.status(), 'server should respond 200').toBe(200);

    const body = await resp.text();
    expect(body, `body should contain "${REAL_CONFIG_MARKER}"`).toContain(REAL_CONFIG_MARKER);
});

// ─── Step 2: SW startup — what actually ran? ──────────────────────────────────
test('step 2 — SW startup coverage: which background.js functions ran', async () => {
    const { context, cov } = await launchWithCoverage();

    // Let SW start up and attempt config fetch
    await new Promise(r => setTimeout(r, 3000));

    // Open a page to ensure SW is active
    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1000));

    const filePath = await cov?.flush('cmd_config_server_debug/startup');

    await cov?.close();
    await context.close();

    if (!filePath) {
        console.log('[step 2] No coverage file written (run with COVERAGE=true)');
        return;
    }

    const stats = readCoverageStats(filePath, 'service_worker', 'background.js', { allowMissingScript: true });

    console.log(`\n[step 2] background.js functions hit: ${stats.gt0} / ${stats.total}`);

    // Print all functions that actually ran, sorted by call count
    const hit = [...stats.byFunction.entries()]
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

    console.log(`[step 2] Functions executed (${hit.length}):`);
    for (const [name, count] of hit) {
        console.log(`  x${String(count).padStart(4)}  ${name}`);
    }

    // Key functions we expect to see if config loading works end-to-end
    const expected = [
        'loadSettings',
        'ensureSettingsSnippetRegistration',
        'syncSettingsSnippets',
        'isUserScriptsAvailable',
    ];

    console.log('\n[step 2] Key function check:');
    for (const fn of expected) {
        const count = stats.byFunction.get(fn) ?? 0;
        console.log(`  ${count > 0 ? '✓' : '✗'}  ${fn}: ${count} calls`);
    }

    // Assert at minimum that loadSettings ran
    expect(
        stats.byFunction.get('loadSettings') ?? 0,
        'loadSettings should have been called on startup'
    ).toBeGreaterThan(0);
});

// ─── Step 3: user script actually executes in the page ────────────────────────
test('step 3 — user script registered + executes in page without errors', async () => {
    const { context, cov } = await launchWithCoverage();

    // Wait for SW to fetch config + register user scripts
    await new Promise(r => setTimeout(r, 2000));

    // Capture page errors and console errors before navigating
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const page = await context.newPage();
    page.on('pageerror', err => pageErrors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(`${msg.text()} [location: ${msg.location().url}]`);
    });
    // Capture all failed requests so we see the exact URL of the 404
    const failedRequests: string[] = [];
    page.on('requestfailed', req => failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
    page.on('response', resp => {
        if (resp.status() >= 400) failedRequests.push(`${resp.status()} ${resp.url()}`);
    });

    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));

    // Check 1: what user scripts are registered in the SW?
    const sw = context.serviceWorkers()[0];
    const scripts: any[] = await sw.evaluate(() =>
        new Promise<any[]>(resolve =>
            (chrome as any).userScripts.getScripts({}, resolve)
        )
    );
    console.log(`\n[step 3] Registered user scripts: ${scripts.length}`);
    for (const s of scripts) {
        const code: string = s.js?.[0]?.code ?? '';
        console.log(`  id=${s.id}  code length=${code.length}`);
        console.log(`  code preview: ${code.slice(0, 120)}...`);
    }

    // Check 2: content script injected? (skInvokeReady set by the __sk_invoke bridge)
    const invokeReady = await page.evaluate(
        () => (document.documentElement.dataset as any).skInvokeReady === 'true'
    );
    console.log(`\n[step 3] skInvokeReady (content script injected): ${invokeReady}`);

    // Check 3: any errors?
    console.log(`[step 3] Page errors (${pageErrors.length}):`, pageErrors.length ? pageErrors : 'none');
    console.log(`[step 3] Console errors (${consoleErrors.length}):`, consoleErrors.length ? consoleErrors : 'none');
    console.log(`[step 3] Failed requests (${failedRequests.length}):`, failedRequests.length ? failedRequests : 'none');

    await cov?.close();
    await context.close();

    expect(scripts.length, 'at least one user script should be registered').toBeGreaterThan(0);
    expect(pageErrors, 'no uncaught page errors expected').toHaveLength(0);
});

// ─── Step 4: config applied — 'tv' (cmd_tab_duplicate) is a user-config-only key
// Only exists if the real .surfingkeysrc.js was loaded and applied.
test('step 4 — config applied: pressing tv duplicates the tab', async () => {
    const { context, cov } = await launchWithCoverage();

    // Wait for SW to fetch config + register user scripts
    await new Promise(r => setTimeout(r, 2000));

    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1000));

    const tabsBefore = context.pages().length;
    console.log(`\n[step 4] tabs before pressing tv: ${tabsBefore}`);

    // Press t then v — chord key defined in real config as cmd_tab_duplicate
    await page.keyboard.press('t');
    await page.keyboard.press('v');
    await new Promise(r => setTimeout(r, 1000));

    const tabsAfter = context.pages().length;
    console.log(`[step 4] tabs after pressing tv: ${tabsAfter}`);

    await cov?.close();
    await context.close();

    expect(tabsAfter, 'tv should have opened a duplicate tab').toBeGreaterThan(tabsBefore);
});
