import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const DEEP_PATH = `${FIXTURE_BASE}/path/to/deep/page.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

test.describe('cmd_nav_url_up (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_nav_url_up');
        await cov?.close();
        await context?.close();
    });

    test('pressing gu on deep path goes up one level', async () => {
        // Navigate to deep path
        await page.goto(DEEP_PATH, { waitUntil: 'load' });
        await page.waitForTimeout(800);

        expect(page.url()).toBe(DEEP_PATH);

        const upPromise = page.waitForURL(`${FIXTURE_BASE}/path/to/deep`, { timeout: 10000 });
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('u');
        await upPromise;

        expect(page.url()).toBe(`${FIXTURE_BASE}/path/to/deep`);
        if (DEBUG) console.log(`URL up: ${DEEP_PATH} → ${page.url()}`);
    });

    test('pressing gu multiple times goes up multiple levels', async () => {
        // Navigate to deep path
        await page.goto(DEEP_PATH, { waitUntil: 'load' });
        await page.waitForTimeout(800);

        // First gu: /path/to/deep/page.html → /path/to/deep
        let upPromise = page.waitForURL(`${FIXTURE_BASE}/path/to/deep`, { timeout: 10000 });
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('u');
        await upPromise;
        await page.waitForTimeout(500);
        expect(page.url()).toBe(`${FIXTURE_BASE}/path/to/deep`);

        // Second gu: /path/to/deep → /path/to
        upPromise = page.waitForURL(`${FIXTURE_BASE}/path/to`, { timeout: 10000 });
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('u');
        await upPromise;
        await page.waitForTimeout(500);
        expect(page.url()).toBe(`${FIXTURE_BASE}/path/to`);

        if (DEBUG) console.log(`URL up ×2: ${DEEP_PATH} → /path/to/deep → /path/to`);
    });

    test('pressing gu at root level stays at root', async () => {
        // Navigate to root
        await page.goto(`${FIXTURE_BASE}/`, { waitUntil: 'load' });
        await page.waitForTimeout(800);

        const urlBefore = page.url();
        expect(urlBefore.replace(/\/$/, '')).toBe('http://127.0.0.1:9873');

        // gu at root should not navigate
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('u');
        await page.waitForTimeout(500);

        const urlAfter = page.url();
        expect(urlAfter.replace(/\/$/, '')).toBe('http://127.0.0.1:9873');
        if (DEBUG) console.log(`URL up at root: ${urlAfter} (unchanged)`);

        // Navigate back to fixture for cleanup
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });
});
