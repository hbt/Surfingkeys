import { test, expect, BrowserContext } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;

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

test.describe('cmd_create_session (Playwright)', () => {
    test.beforeAll(async () => {
        ({ context } = await launchExtensionContext());
        const page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        await clearSessions(context);
    });

    test('creating a session saves tabs to storage', async () => {
        const sessionName = 'test-session-1';
        const tabs = [['http://example.com', 'http://example.org']];

        await createSession(context, sessionName, tabs);

        const sessions = await getSessions(context);
        expect(sessions[sessionName]).toBeDefined();
        expect(sessions[sessionName].tabs).toEqual(tabs);
    });

    test('creating multiple sessions stores them separately', async () => {
        await createSession(context, 'session-one', [['http://example.com']]);
        await createSession(context, 'session-two', [['http://example.org']]);

        const sessions = await getSessions(context);
        expect(sessions['session-one']).toBeDefined();
        expect(sessions['session-two']).toBeDefined();
        expect(Object.keys(sessions).length).toBe(2);
    });

    test('creating session with duplicate name overwrites existing session', async () => {
        const sessionName = 'duplicate-session';

        await createSession(context, sessionName, [['http://example.com', 'http://example.org']]);
        const first = await getSessions(context);
        expect(first[sessionName].tabs[0].length).toBe(2);

        await createSession(context, sessionName, [['http://example.com']]);
        const second = await getSessions(context);
        expect(second[sessionName].tabs[0].length).toBe(1);
    });
});
