import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand, openSiblingTabViaSW } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_tab_warmup';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const UNIQUE_ID = 'cmd_tab_warmup';

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
        });
    });
}

async function getAllTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
        });
    });
}

test.describe('cmd_tab_warmup (Playwright)', () => {
    test.setTimeout(30_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        for (const p of context.pages()) {
            await p.close().catch(() => {});
        }
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    async function closeAllExcept(keepPage: Page) {
        for (const p of context.pages()) {
            if (p !== keepPage) await p.close().catch(() => {});
        }
        await keepPage.bringToFront();
        await keepPage.waitForTimeout(200);
    }

    test('restores active tab to invoking tab after warming cold tabs', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                // Set up anchor tab (active — will be in tabActivated)
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);
                await anchor.waitForTimeout(300);

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                // Record which tab is active before the command
                const activeBefore = await getActiveTabViaSW(context);
                expect(activeBefore).toBeTruthy();
                const anchorTabId = activeBefore.id;

                // Open 2 cold tabs (active: false → not in tabActivated)
                await openSiblingTabViaSW(context, FIXTURE_URL);
                await openSiblingTabViaSW(context, FIXTURE_URL);
                await anchor.waitForTimeout(300);

                const tabsBefore = await getAllTabsViaSW(context);
                expect(tabsBefore.length).toBe(3);

                // Log lastAccessed to verify cold tabs haven't been focused before the command
                console.log('[warmup-test] tabs before command:');
                for (const t of tabsBefore) {
                    console.log(`  tab ${t.id} active=${t.active} lastAccessed=${t.lastAccessed ?? 'none'}`);
                }

                const beforeMs = Date.now();

                // Invoke the warmup command from the anchor tab
                const ok = await invokeCommand(anchor, UNIQUE_ID);
                expect(ok).toBe(true);

                // Wait for async warmup to complete (activates cold tabs + restores)
                await anchor.waitForTimeout(2000);

                const sw = context.serviceWorkers()[0];
                const warmupLog = await sw?.evaluate(() => (globalThis as any)._warmupLog ?? []);
                console.log('[warmup-test] SW warmup log:', JSON.stringify(warmupLog, null, 2));

                // Verify otel span was written to the server
                const otelSpan = await fetch('http://localhost:9602/otel-last').then(r => r.json()).catch(() => null);
                console.log('[warmup-test] otel span:', JSON.stringify(otelSpan, null, 2));
                expect(otelSpan).toBeTruthy();
                expect(otelSpan.name).toBe('cmd_tab_warmup');
                expect(otelSpan.startTimeUnixMs).toBeGreaterThanOrEqual(beforeMs);
                expect(otelSpan.status).toBe('OK');
                expect(otelSpan.attributes['tabs.warmed']).toBeGreaterThan(0);
                expect(otelSpan.events.some((e: any) => e.name === 'tab.warmed')).toBe(true);

                // Assert active tab is restored to the invoking (anchor) tab
                const activeAfter = await getActiveTabViaSW(context);
                expect(activeAfter).toBeTruthy();
                expect(activeAfter.id).toBe(anchorTabId);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/restores_active/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/restores_active/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });
});
