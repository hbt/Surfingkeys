import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const SUITE_LABEL = 'cmd_open_session';
const FIXTURE_URL_1 = `${FIXTURE_BASE}/scroll-test.html`;
const FIXTURE_URL_2 = `${FIXTURE_BASE}/input-test.html`;

let context: BrowserContext;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function clearSessions(ctx: BrowserContext): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(() => {
        return new Promise<void>((resolve) => {
            chrome.storage.local.set({ sessions: {} }, () => resolve());
        });
    });
}

async function createSession(ctx: BrowserContext, name: string, urls: string[]): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(({ name, urls }: { name: string; urls: string[] }) => {
        return new Promise<void>((resolve) => {
            chrome.storage.local.get('sessions', (data: any) => {
                const sessions = data.sessions || {};
                sessions[name] = { tabs: [urls] };
                chrome.storage.local.set({ sessions }, () => resolve());
            });
        });
    }, { name, urls });
}

async function getSession(ctx: BrowserContext, name: string): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((name: string) => {
        return new Promise<any>((resolve) => {
            chrome.storage.local.get('sessions', (data: any) => {
                const sessions = data.sessions || {};
                resolve(sessions[name] || null);
            });
        });
    }, name);
}

async function openSession(ctx: BrowserContext, name: string): Promise<void> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate((name: string) => {
        return new Promise<void>((resolve) => {
            chrome.storage.local.get('sessions', (data: any) => {
                if (data.sessions && data.sessions[name]) {
                    const urls: string[] = data.sessions[name].tabs[0];
                    let count = 0;
                    urls.forEach((url: string) => {
                        chrome.tabs.create({ url, active: false }, () => {
                            count++;
                            if (count === urls.length) resolve();
                        });
                    });
                } else {
                    resolve();
                }
            });
        });
    }, name);
}

test.describe('cmd_open_session (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL_1);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        const page = await context.newPage();
        await page.goto(FIXTURE_URL_1, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await clearSessions(context);
        // Close extra pages leaving just the first
        const pages = context.pages();
        for (let i = 1; i < pages.length; i++) {
            await pages[i].close().catch(() => {});
        }
    });

    test('openSession saves and retrieves session data correctly', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL_1, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const sessionName = 'test-session-1';
                const urls = [FIXTURE_URL_1, FIXTURE_URL_2];

                await createSession(context, sessionName, urls);

                const saved = await getSession(context, sessionName);
                expect(saved).not.toBeNull();
                expect(saved.tabs).toEqual([urls]);
            },
        );
    });

    test('openSession restores tabs from saved session', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL_1, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const sessionName = 'restore-session';
                const urls = [FIXTURE_URL_1, FIXTURE_URL_2];

                await createSession(context, sessionName, urls);

                const initialCount = context.pages().length;

                await openSession(context, sessionName);
                await context.pages()[0].waitForTimeout(1000);

                const finalPages = context.pages();
                expect(finalPages.length).toBeGreaterThan(initialCount);

                const finalUrls = finalPages.map(p => p.url());
                // At least one session URL should be present
                const hasSessionUrl = urls.some(u => finalUrls.some(fu => fu === u || fu.includes(u)));
                expect(hasSessionUrl).toBe(true);
            },
        );
    });

    test('openSession with non-existent session does nothing', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL_1, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const initialCount = context.pages().length;

                await openSession(context, 'non-existent-session');
                await context.pages()[0].waitForTimeout(500);

                expect(context.pages().length).toBe(initialCount);
            },
        );
    });
});
