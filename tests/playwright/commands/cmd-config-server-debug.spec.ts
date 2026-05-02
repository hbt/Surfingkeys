/**
 * Config server debug — step by step.
 *
 * Port 9602: fixture config (neutral, used by all other tests)
 * Port 9601: real .surfingkeysrc.js (used only by debug/real-config tests)
 *
 * Run with:
 *   COVERAGE=true bunx playwright test tests/playwright/commands/cmd-config-server-debug.spec.ts --reporter=line
 */
import { test, expect } from '@playwright/test';
import { launchWithCoverage, invokeCommand, FIXTURE_BASE } from '../utils/pw-helpers';
import { readCoverageStats } from '../utils/coverage-utils';

const FIXTURE_CONFIG_URL = 'http://localhost:9602/config';
const REAL_CONFIG_URL    = 'http://localhost:9601/config';

const FIXTURE_MARKER = 'cmd_config_server_test_marker'; // defined in data/fixtures/test-config-server.js
const REAL_MARKER    = 'settings.newTabUrl';             // defined in .surfingkeysrc.js

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

// ─── 9602: fixture config ─────────────────────────────────────────────────────
test('port 9602 — GET /config returns fixture config content', async ({ request }) => {
    const resp = await request.get(FIXTURE_CONFIG_URL);
    expect(resp.status(), '9602 should respond 200').toBe(200);
    const body = await resp.text();
    expect(body, `9602 body should contain "${FIXTURE_MARKER}"`).toContain(FIXTURE_MARKER);
});

// ─── 9601: real config ────────────────────────────────────────────────────────
test('port 9601 — GET /config returns real config content', async ({ request }) => {
    const resp = await request.get(REAL_CONFIG_URL);
    expect(resp.status(), '9601 should respond 200').toBe(200);
    const body = await resp.text();
    expect(body, `9601 body should contain "${REAL_MARKER}"`).toContain(REAL_MARKER);
});

// ─── SW startup coverage ──────────────────────────────────────────────────────
test('SW startup — which background.js functions ran', async () => {
    const { context, cov } = await launchWithCoverage();
    await new Promise(r => setTimeout(r, 3000));

    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1000));

    const filePath = await cov?.flush('cmd_config_server_debug/startup');
    await cov?.close();
    await context.close();

    if (!filePath) {
        console.log('[SW startup] No coverage (run with COVERAGE=true)');
        return;
    }

    const stats = readCoverageStats(filePath, 'service_worker', 'background.js', { allowMissingScript: true });
    const hit = [...stats.byFunction.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
    console.log(`\n[SW startup] ${stats.gt0}/${stats.total} functions hit:`);
    for (const [name, count] of hit) {
        console.log(`  x${String(count).padStart(4)}  ${name}`);
    }

    const key = (fn: string) => stats.byFunction.get(fn) ?? 0;
    for (const fn of ['loadSettings', 'ensureSettingsSnippetRegistration', 'syncSettingsSnippets', 'isUserScriptsAvailable']) {
        console.log(`  ${key(fn) > 0 ? '✓' : '✗'}  ${fn}: ${key(fn)} calls`);
    }

    expect(key('loadSettings'), 'loadSettings should run on startup').toBeGreaterThan(0);
});

// ─── Fixture config applied via 9602 ─────────────────────────────────────────
test('fixture config applied — cmd_config_server_test_marker registered', async () => {
    const { context, cov } = await launchWithCoverage();
    await new Promise(r => setTimeout(r, 2000));

    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1000));

    const ok = await invokeCommand(page, 'cmd_config_server_test_marker');
    console.log(`\n[fixture applied] cmd_config_server_test_marker invokable: ${ok}`);

    await cov?.close();
    await context.close();

    expect(ok, 'fixture config marker command should be registered').toBe(true);
});
