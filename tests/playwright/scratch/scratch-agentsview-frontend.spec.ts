/**
 * Scratch test: agentsview frontend loads at http://127.0.0.1:8080
 *
 * Checks:
 *   1. HTTP 200 via fetch()
 *   2. Placeholder page is NOT shown (frontend built)
 *   3. Root element mounts (app shell visible)
 *   4. Session list renders at least one entry
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/scratch-agentsview-frontend.spec.ts \
 *     --config=playwright.scratch.config.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithCoverage } from '../utils/pw-helpers';

const AGENTSVIEW_URL = 'http://127.0.0.1:8080';

let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
    ({ context } = await launchWithCoverage());
    page = await context.newPage();
    await page.goto(AGENTSVIEW_URL, { waitUntil: 'load' });
    await page.waitForTimeout(1000); // let SPA render
});

test.afterAll(async () => {
    await context?.close();
});

test('HTTP 200 from agentsview root', async () => {
    const status = await page.evaluate(async (url: string) => {
        const res = await fetch(url);
        return res.status;
    }, AGENTSVIEW_URL);
    console.log(`HTTP status: ${status}`);
    expect(status).toBe(200);
});

test('frontend is built — placeholder not visible', async () => {
    const placeholder = page.getByText('AgentsView frontend assets are not built');
    await expect(placeholder).not.toBeVisible();
});

test('app shell mounts', async () => {
    // Svelte mounts into #app or body; check something rendered beyond a blank page
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    console.log(`body text length: ${bodyText.length}`);
    expect(bodyText.length).toBeGreaterThan(0);
});

test('session list renders entries', async () => {
    // Wait for sessions to appear — the SPA fetches /api/v1/sessions on load
    const sessionItem = page.locator('[data-testid="session-item"], .session-item, [class*="session"]').first();
    // Fallback: any list item in the sidebar
    const anyListItem = page.locator('ul li, [role="listitem"]').first();

    const hasSession = await sessionItem.isVisible({ timeout: 5000 }).catch(() => false);
    const hasList    = await anyListItem.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`session item visible: ${hasSession}, list item visible: ${hasList}`);
    expect(hasSession || hasList).toBe(true);
});
