import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_rename_tab_group';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

async function callSKApi(p: Page, fn: string, ...args: unknown[]) {
    await p.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await p.waitForTimeout(100);
}

async function createGroupWithTitleViaSW(tabId: number, title: string): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    const groupId = await sw.evaluate((id: number) => {
        return new Promise<number>((resolve) => {
            chrome.tabs.group({ tabIds: [id] }, (gid) => resolve(gid));
        });
    }, tabId);
    await sw.evaluate(([id, t]: [number, string]) => {
        return new Promise<void>((resolve) => {
            chrome.tabGroups.update(id, { title: t }, () => resolve());
        });
    }, [groupId, title] as [number, string]);
    return groupId;
}

async function getGroupTitleViaSW(groupId: number): Promise<string> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((id: number) => {
        return new Promise<string>((resolve) => {
            chrome.tabGroups.get(id, (group) => resolve(group?.title || ''));
        });
    }, groupId);
}

async function getActiveTabIdViaSW(): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]?.id ?? -1));
        });
    });
}

async function ungroupAllViaSW(): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate(() => {
        return new Promise<void>((resolve) => {
            chrome.tabs.query({}, (tabs: any[]) => {
                const grouped = tabs.filter((t: any) => t.groupId !== -1);
                if (!grouped.length) { resolve(); return; }
                chrome.tabs.ungroup(grouped.map((t: any) => t.id) as [number, ...number[]], () => resolve());
            });
        });
    });
}

async function isOmnibarOpen(p: Page): Promise<boolean> {
    return p.evaluate(() => {
        const divs = document.querySelectorAll('div');
        for (const div of Array.from(divs)) {
            if (div.shadowRoot) {
                const iframe = div.shadowRoot.querySelector('iframe.sk_ui');
                if (iframe) {
                    const h = (iframe as HTMLElement).style.height;
                    return h !== '0px' && h !== '';
                }
            }
        }
        return false;
    });
}

async function waitForOmnibar(p: Page, open: boolean, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isOmnibarOpen(p) === open) return;
        await p.waitForTimeout(100);
    }
}

test.describe('cmd_rename_tab_group (Playwright)', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(200);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('renameTabGroup renames the current tab group via omnibar', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                await ungroupAllViaSW();

                await callSKApi(page, 'unmapAllExcept', []);
                await callSKApi(page, 'mapcmdkey', 'q', 'cmd_omnibar_commands');

                // Group the active tab and give it a title
                const tabId = await getActiveTabIdViaSW();
                const groupId = await createGroupWithTitleViaSW(tabId, 'before');
                await page.waitForTimeout(200);

                const titleBefore = await getGroupTitleViaSW(groupId);
                expect(titleBefore).toBe('before');

                // Open the commands omnibar
                await page.mouse.click(100, 100);
                await page.keyboard.press('q');
                await waitForOmnibar(page, true);

                // Type the rename command and execute it
                await page.keyboard.type('renameTabGroup after');
                await page.waitForTimeout(300);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(600);

                const titleAfter = await getGroupTitleViaSW(groupId);
                if (DEBUG) console.log(`group title: before=${titleBefore}, after=${titleAfter}`);
                expect(titleAfter).toBe('after');

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/rename/background`) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
            },
        );
    });
});
