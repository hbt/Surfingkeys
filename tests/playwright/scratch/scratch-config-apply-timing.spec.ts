/**
 * Scratch test: how long does user-config application take on a fresh page load?
 *
 * content.ts now wraps RUNTIME('getSettings') -> applySettings() in an otel span
 * ('config.applyOnPageLoad', see src/content_scripts/content.ts). This test navigates
 * to a real external site (hbtlabs.com) and reads the span back from the config
 * server's /otel-last endpoint to report the elapsed ms.
 *
 * Usage:
 *   bunx playwright test tests/playwright/scratch/scratch-config-apply-timing.spec.ts \
 *     --config=playwright.scratch.config.ts
 */
import { test, expect } from '@playwright/test';
import { launchWithCoverage } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;
const OTEL_LAST_URL = 'http://localhost:9602/otel-last';
const EXTERNAL_URL = 'https://hbtlabs.com';

test('config.applyOnPageLoad span lands and reports elapsed time on fresh navigation', async ({ request }) => {
    const { context, cov } = await launchWithCoverage();
    const page = await context.newPage();
    await page.goto(EXTERNAL_URL, { waitUntil: 'load' });
    await page.waitForTimeout(500); // let the fire-and-forget /otel beacon land

    const resp = await request.get(OTEL_LAST_URL);
    expect(resp.status()).toBe(200);
    const span = await resp.json();
    if (DEBUG) console.log('otel span:', JSON.stringify(span));

    expect(span).not.toBeNull();
    expect(span.name).toBe('config.applyOnPageLoad');
    expect(typeof span.attributes.host).toBe('string');
    expect(span.events.some((e: any) => e.name === 'settings.received')).toBe(true);
    expect(span.events.some((e: any) => e.name === 'settings.applied')).toBe(true);

    const elapsedMs = span.endTimeUnixMs - span.startTimeUnixMs;
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    console.log(`[config-apply-timing] elapsed=${elapsedMs}ms host=${span.attributes.host}`);

    await cov?.close();
    await context.close();
});
