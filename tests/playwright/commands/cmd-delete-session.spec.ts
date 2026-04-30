import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_delete_session';
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

async function createSession(ctx: BrowserContext, name: string, tabs: string[][]): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(({ name, tabs }: { name: string; tabs: string[][] }) => {
        return new Promise<void>((resolve) => {
            chrome.storage.local.get('sessions', (data: any) => {
                const sessions = data.sessions || {};
                sessions[name] = { tabs };
                chrome.storage.local.set({ sessions }, () => resolve());
            });
        });
    }, { name, tabs });
}

async function deleteSession(ctx: BrowserContext, name: string): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((name: string) => {
        return new Promise<void>((resolve) => {
            chrome.storage.local.get('sessions', (data: any) => {
                const sessions = data.sessions || {};
                delete sessions[name];
                chrome.storage.local.set({ sessions }, () => resolve());
            });
        });
    }, name);
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

test.describe('cmd_delete_session (Playwright)', () => {
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

    test('deleting existing session removes it from storage', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const sessionName = 'test-session-1';
                await createSession(context, sessionName, [['http://example.com']]);

                const before = await getSessions(context);
                expect(before).toHaveProperty(sessionName);

                await deleteSession(context, sessionName);

                const after = await getSessions(context);
                expect(after).not.toHaveProperty(sessionName);
            },
        );
    });

    test('deleting session preserves other sessions', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await createSession(context, 'keep-1', [['http://example.com']]);
                await createSession(context, 'keep-2', [['http://example.org']]);
                await createSession(context, 'to-delete', [['http://delete.me']]);

                await deleteSession(context, 'to-delete');

                const sessions = await getSessions(context);
                expect(sessions).not.toHaveProperty('to-delete');
                expect(sessions).toHaveProperty('keep-1');
                expect(sessions).toHaveProperty('keep-2');
            },
        );
    });

    test('deleting non-existent session does not error', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const before = await getSessions(context);
                expect(before).not.toHaveProperty('ghost-session');

                // Should not throw
                await deleteSession(context, 'ghost-session');

                const after = await getSessions(context);
                expect(after).toEqual(before);
            },
        );
    });
});
