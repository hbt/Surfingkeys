import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_group_edit_name';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'tGe';
const UNIQUE_ID = 'cmd_tab_group_edit_name';

let context: BrowserContext;
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

async function createGroupViaSW(tabIds: number[]): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate((ids: number[]) => {
        return new Promise<number>((resolve) => {
            chrome.tabs.group({ tabIds: ids as [number, ...number[]] }, (groupId) => resolve(groupId));
        });
    }, tabIds);
}

async function setGroupTitleViaSW(groupId: number, title: string): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    await sw.evaluate(([id, t]: [number, string]) => {
        return new Promise<void>((resolve) => {
            chrome.tabGroups.update(id, { title: t }, () => resolve());
        });
    }, [groupId, title] as [number, string]);
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

async function getActiveTabIdViaSW(): Promise<number> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<number>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]?.id ?? -1));
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

async function waitForOmnibarState(p: Page, expected: boolean, timeoutMs = 6000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const open = await isOmnibarOpen(p);
        if (open === expected) return true;
        await p.waitForTimeout(100);
    }
    return false;
}

async function getOmnibarInputValue(p: Page): Promise<string | null> {
    for (const frame of p.frames()) {
        try {
            const val = await frame.evaluate(() => {
                const input = document.querySelector<HTMLInputElement>('#sk_omnibarSearchArea input');
                return input ? input.value : null;
            });
            if (val !== null) return val;
        } catch (_) {}
    }
    return null;
}

async function pressChord(p: Page) {
    await p.keyboard.press('t');
    await p.waitForTimeout(50);
    await p.keyboard.press('G');
    await p.waitForTimeout(50);
    await p.keyboard.press('e');
    await p.waitForTimeout(600);
}

test.describe('cmd_tab_group_edit_name (Playwright)', () => {
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

    test('tGe on grouped tab → renames group via omnibar', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);
                await anchor.waitForTimeout(300);
                await ungroupAllViaSW();

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);

                // Group the anchor tab and set its title
                const anchorId = await getActiveTabIdViaSW();
                expect(anchorId).toBeGreaterThan(0);
                const groupId = await createGroupViaSW([anchorId]);
                await setGroupTitleViaSW(groupId, 'old name');
                await anchor.waitForTimeout(200);

                const titleBefore = await getGroupTitleViaSW(groupId);
                expect(titleBefore).toBe('old name');

                // Invoke tGe chord
                await pressChord(anchor);

                // Omnibar should open pre-filled with "renameTabGroup old name"
                const opened = await waitForOmnibarState(anchor, true);
                expect(opened).toBe(true);

                // Clear the input and type the new name
                await anchor.keyboard.press('Control+a');
                await anchor.waitForTimeout(100);
                await anchor.keyboard.type('renameTabGroup new name');
                await anchor.waitForTimeout(300);
                await anchor.keyboard.press('Enter');
                await anchor.waitForTimeout(600);

                const titleAfter = await getGroupTitleViaSW(groupId);
                if (DEBUG) console.log(`group title before=${titleBefore}, after=${titleAfter}`);
                expect(titleAfter).toBe('new name');

                // After execution the omnibar stays open but input is cleared
                const omnibarStillOpen = await isOmnibarOpen(anchor);
                expect(omnibarStillOpen).toBe(true);
                const inputVal = await getOmnibarInputValue(anchor);
                if (DEBUG) console.log(`omnibar input after Enter: "${inputVal}"`);
                expect(inputVal).toBe('');

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/rename/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/rename/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('tGe on ungrouped tab → no omnibar opens', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);
                await anchor.waitForTimeout(300);
                await ungroupAllViaSW();

                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);

                // Verify anchor tab is NOT in a group
                const anchorId = await getActiveTabIdViaSW();
                const sw = context.serviceWorkers()[0]!;
                const anchorGroupId = await sw.evaluate((id: number) => {
                    return new Promise<number>((resolve) => {
                        chrome.tabs.get(id, (tab) => resolve(tab?.groupId ?? -1));
                    });
                }, anchorId);
                expect(anchorGroupId).toBe(-1);

                // Invoke tGe chord — should be a no-op
                await pressChord(anchor);

                // Omnibar should NOT open
                const opened = await isOmnibarOpen(anchor);
                if (DEBUG) console.log(`omnibar opened on ungrouped tab: ${opened}`);
                expect(opened).toBe(false);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/noop/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/noop/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });
});
