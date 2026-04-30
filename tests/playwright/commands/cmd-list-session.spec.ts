import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_list_session';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function getSessions(ctx: BrowserContext): Promise<Record<string, any>> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.storage.local.get('sessions', (data: any) => resolve(data.sessions || {}));
        });
    });
}

async function clearSessions(ctx: BrowserContext): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(() => {
        return new Promise<void>((resolve) => {
            chrome.storage.local.set({ sessions: {} }, () => resolve());
        });
    });
}

async function createTestSessions(ctx: BrowserContext, sessions: Record<string, any>): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((sessions: Record<string, any>) => {
        return new Promise<void>((resolve) => {
            chrome.storage.local.get('sessions', (data: any) => {
                const existing = data.sessions || {};
                const updated = { ...existing, ...sessions };
                chrome.storage.local.set({ sessions: updated }, () => resolve());
            });
        });
    }, sessions);
}

async function listSessions(ctx: BrowserContext): Promise<string[]> {
    const sessions = await getSessions(ctx);
    return Object.keys(sessions);
}

test.describe('cmd_list_session (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        const page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await clearSessions(context);
    });

    test('listSession retrieves empty list when no sessions exist', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const names = await listSessions(context);
                expect(names.length).toBe(0);
            },
        );
    });

    test('listSession retrieves multiple sessions from storage', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await createTestSessions(context, {
                    'work': { tabs: [['https://example.com']] },
                    'personal': { tabs: [['https://test.com']] },
                    'shopping': { tabs: [['https://shop.com']] },
                });

                const names = await listSessions(context);
                expect(names.length).toBe(3);
                expect(names).toContain('work');
                expect(names).toContain('personal');
                expect(names).toContain('shopping');
            },
        );
    });

    test('listSession retrieves sessions after modification', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await createTestSessions(context, {
                    'session1': { tabs: [['https://1.com']] },
                    'session2': { tabs: [['https://2.com']] },
                });

                let names = await listSessions(context);
                expect(names.length).toBe(2);

                await createTestSessions(context, {
                    'session3': { tabs: [['https://3.com']] },
                });

                names = await listSessions(context);
                expect(names.length).toBe(3);
                expect(names).toContain('session1');
                expect(names).toContain('session2');
                expect(names).toContain('session3');
            },
        );
    });
});
