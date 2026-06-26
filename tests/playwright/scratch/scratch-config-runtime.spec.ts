/**
 * Scratch: detect runtime errors in the user's config file.
 *
 * The extension SW initializes by loading the fixture config from port 9602.
 * We then trigger a settings reload from port 9601 (which serves the real
 * .surfingkeysrc.js via globalThis._handleMessage → loadSettingsFromUrl handler).
 * This calls _updateAndPostSettings → ensureSettingsSnippetRegistration, so the
 * user script is re-registered with the real config. Navigating to a page then
 * runs the user script and any "[SurfingKeys] Error found in settings:" console
 * error is captured.
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-config-runtime.spec.ts \
 *       --config=playwright.scratch.config.ts
 */

import { test, expect } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

// Port 9601 serves the real .surfingkeysrc.js (symlink → ~/.surfingkeys-2026.js)
const REAL_CONFIG_URL = 'http://localhost:9601/config';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

test('config file has no runtime errors when loaded by extension', async () => {
    const { context } = await launchExtensionContext();

    // Wait for SW to start and finish its initial load from port 9602 (fixture config)
    const sw = context.serviceWorkers().find(w => w.url().includes('background.js'))
        ?? await context.waitForEvent('serviceworker', {
            predicate: w => w.url().includes('background.js'),
            timeout: 10_000,
        });
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Trigger config reload from port 9601 (real config) via globalThis._handleMessage.
    // The handler calls _updateAndPostSettings → ensureSettingsSnippetRegistration,
    // re-registering the user script with the real config.
    const loadResult = await sw.evaluate((url: string) =>
        new Promise<{ status: string }>((resolve) => {
            (globalThis as any)._handleMessage(
                { action: 'loadSettingsFromUrl', url },
                {},
                resolve,
            );
        }), REAL_CONFIG_URL
    );

    expect(loadResult.status, 'config fetch from port 9601 must succeed').toBe('Succeeded');

    // Allow user script re-registration to complete
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Open a page and capture config errors BEFORE navigating
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', msg => {
        if (msg.text().includes('[SurfingKeys] Error found in settings:')) {
            errors.push(msg.text());
        }
    });

    // Navigate — user script runs here, errors surface on page console
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    await context.close();

    expect(errors, `Runtime errors in config:\n${errors.join('\n')}`).toHaveLength(0);
});
