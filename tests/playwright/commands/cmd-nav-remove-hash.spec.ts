import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;

test.describe('cmd_nav_remove_hash (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('pressing g# removes hash fragment from URL', async () => {
        // Navigate to URL with hash
        await page.goto(`${FIXTURE_URL}#test-hash`, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        const urlBefore = page.url();
        expect(urlBefore).toContain('#test-hash');

        // Wait for URL to change to remove hash
        const hashRemovedPromise = page.waitForURL(FIXTURE_URL, { timeout: 10000 });
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('#');
        await hashRemovedPromise;

        const urlAfter = page.url();
        expect(urlAfter).not.toContain('#');
        expect(urlAfter).toBe(FIXTURE_URL);
        if (DEBUG) console.log(`Remove hash: ${urlBefore} → ${urlAfter}`);
    });

    test('g# removes hash while preserving query parameters', async () => {
        // Navigate to URL with both query and hash
        const urlWithBoth = `${FIXTURE_URL}?page=1&sort=desc#section2`;
        await page.goto(urlWithBoth, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        const urlBefore = page.url();
        expect(urlBefore).toContain('#section2');
        expect(urlBefore).toContain('?page=1');

        const hashRemovedPromise = page.waitForURL(`${FIXTURE_URL}?page=1&sort=desc`, { timeout: 10000 });
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('#');
        await hashRemovedPromise;

        const urlAfter = page.url();
        expect(urlAfter).not.toContain('#');
        expect(urlAfter).toContain('?page=1&sort=desc');
        if (DEBUG) console.log(`Remove hash preserves query: ${urlBefore} → ${urlAfter}`);
    });

    test('g# on URL without hash leaves URL unchanged', async () => {
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        const urlBefore = page.url();
        expect(urlBefore).not.toContain('#');

        // Press g# — no navigation should occur
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('#');
        await page.waitForTimeout(500);

        const urlAfter = page.url();
        expect(urlAfter).toBe(urlBefore);
        if (DEBUG) console.log(`No-op g# (no hash): ${urlAfter}`);
    });
});
