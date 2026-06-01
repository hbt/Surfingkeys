/**
 * Scratch test: errorServerReporter — ships extension errors to local config server.
 *
 * Tests that errors in background (SW) context are written to log/errors.jsonl
 * when errorReportToServer is enabled, and that page JS errors are NOT logged
 * (filtered out because they lack a chrome-extension:// source).
 *
 * Prerequisites:
 *   - Config server running on :9600 (`./bin/dbg server-start`)
 *
 * Run:
 *   bunx playwright test tests/playwright/scratch/error-server-reporter.spec.ts \
 *     --config=playwright.scratch.config.ts
 */
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const ERROR_LOG = resolve(__dirname, '../../../log/errors.jsonl');
const SERVER_URL = 'http://localhost:9600';

function readErrorLog(): any[] {
    if (!existsSync(ERROR_LOG)) return [];
    return readFileSync(ERROR_LOG, 'utf8')
        .split('\n')
        .filter(l => l.trim())
        .map(l => JSON.parse(l));
}

async function pollForEntryAfter(
    startIndex: number,
    predicate: (e: any) => boolean,
    timeoutMs = 5000,
    intervalMs = 300
): Promise<any | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const entry = readErrorLog().slice(startIndex).find(predicate);
        if (entry) return entry;
        await new Promise(r => setTimeout(r, intervalMs));
    }
    return undefined;
}

test.describe('error-server-reporter', () => {
    let context: any;
    let cov: any;
    let page: any;

    test.beforeAll(async () => {
        // Verify server is up
        const resp = await fetch(`${SERVER_URL}/health`).catch(() => null);
        if (!resp || !resp.ok) {
            throw new Error('Config server not running. Run: ./bin/dbg server-start');
        }

        const result = await launchWithCoverage();
        context = result.context;
        cov = result.cov;

        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        // Ensure flag is enabled in SW
        const sw = context.serviceWorkers()[0];
        if (!sw) throw new Error('No service worker found');
        await sw.evaluate(() =>
            new Promise<void>(r => (chrome.storage.local as any).set({ errorReportToServer: true }, r))
        );
        await page.waitForTimeout(300);  // let storage.onChanged invalidate cache
    });

    test.afterAll(async () => {
        await cov?.close();
        await context?.close();
    });

    test('SW unhandled rejection is logged', async () => {
        const sw = context.serviceWorkers()[0];
        const marker = `sk-test-sw-rejection-${Date.now()}`;
        const startIndex = readErrorLog().length;

        await sw.evaluate((msg: string) => {
            Promise.reject(new Error(msg));
        }, marker);

        const entry = await pollForEntryAfter(startIndex, e => e.message?.includes(marker));
        expect(entry, `Expected log entry for "${marker}"`).toBeDefined();
        expect(entry.context).toBe('background');
        expect(entry.type).toBe('unhandledrejection');
        expect(entry.extensionId).toBeTruthy();
    });

    test('SW sync error (via setTimeout throw) is logged', async () => {
        const sw = context.serviceWorkers()[0];
        const marker = `sk-test-sw-onerror-${Date.now()}`;
        const startIndex = readErrorLog().length;

        await sw.evaluate((msg: string) => {
            setTimeout(() => { throw new Error(msg); }, 0);
        }, marker);
        await page.waitForTimeout(500);

        const entry = await pollForEntryAfter(startIndex, e => e.message?.includes(marker));
        expect(entry, `Expected log entry for "${marker}"`).toBeDefined();
        expect(entry.context).toBe('background');
        expect(entry.type).toBe('onerror');
    });

    test('page JS error (non-extension source) is NOT logged', async () => {
        const marker = `sk-test-page-error-${Date.now()}`;
        const startIndex = readErrorLog().length;

        // Throw in page main world — source will be the fixture URL, not chrome-extension://
        await page.evaluate((msg: string) => {
            setTimeout(() => { throw new Error(msg); }, 0);
        }, marker);
        await page.waitForTimeout(1000);

        const entry = readErrorLog().slice(startIndex).find((e: any) => e.message?.includes(marker));
        expect(entry, 'Page JS error should NOT be in log').toBeUndefined();
    });
});
