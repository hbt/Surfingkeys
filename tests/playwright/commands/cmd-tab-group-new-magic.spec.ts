import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_group_new_magic';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;
const KEY = 'tGn';
const UNIQUE_ID = 'cmd_tab_group_new_magic';

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

async function setConf(p: Page, key: string, value: unknown) {
    await p.evaluate(([k, v]) => {
        document.dispatchEvent(new CustomEvent('__sk_conf_override', {
            detail: { key: k, value: v }
        }));
    }, [key, value] as [string, unknown]);
    await p.waitForTimeout(50);
}

async function getTabsViaSW(): Promise<any[]> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
        });
    });
}

async function getTabGroupsViaSW(): Promise<any[]> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabGroups.query({}, (groups: any[]) => resolve(groups));
        });
    });
}

async function ungroupAllViaSW(): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) return;
    await sw.evaluate(() => {
        return new Promise<void>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                const grouped = tabs.filter((t: any) => t.groupId !== -1);
                if (!grouped.length) { resolve(); return; }
                chrome.tabs.ungroup(grouped.map((t: any) => t.id) as [number, ...number[]], () => resolve());
            });
        });
    });
}

test.describe('cmd_tab_group_new_magic (pending-key, Playwright)', () => {
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

    async function pressChord(p: Page, magicKey: string) {
        await p.keyboard.press('t');
        await p.waitForTimeout(50);
        await p.keyboard.press('G');
        await p.waitForTimeout(50);
        await p.keyboard.press('n');
        await p.waitForTimeout(50);
        await p.keyboard.press(magicKey);
        await p.waitForTimeout(500);
    }

    // ---- tests ----

    test('tGnt groups only the active tab (CurrentTab)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const extra = await context.newPage();
                await extra.goto(FIXTURE_URL, { waitUntil: 'load' });
                await extra.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                await ungroupAllViaSW();
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 't': 'CurrentTab' });

                const groupsBefore = await getTabGroupsViaSW();
                expect(groupsBefore.length).toBe(0);

                await pressChord(anchor, 't');

                const groupsAfter = await getTabGroupsViaSW();
                expect(groupsAfter.length).toBeGreaterThanOrEqual(1);

                // Only the active tab (anchor) should be grouped
                const tabs = await getTabsViaSW();
                const anchorTab = tabs.find((t: any) => t.active);
                const extraTab = tabs.find((t: any) => !t.active);
                expect(anchorTab?.groupId).toBeGreaterThan(0);
                if (extraTab) expect(extraTab.groupId).toBe(-1);

                if (DEBUG) console.log(`tGnt: groups=${groupsAfter.length}, anchorGroupId=${anchorTab?.groupId}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/tGnt/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/tGnt/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('tGne groups all tabs to the right (DirectionRight)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                const right1 = await context.newPage();
                await right1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await right1.waitForTimeout(200);
                const right2 = await context.newPage();
                await right2.goto(FIXTURE_URL, { waitUntil: 'load' });
                await right2.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                await ungroupAllViaSW();
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'e': 'DirectionRight' });

                const groupsBefore = await getTabGroupsViaSW();
                expect(groupsBefore.length).toBe(0);

                const tabsBefore = await getTabsViaSW();
                expect(tabsBefore.length).toBe(3);

                await pressChord(anchor, 'e');

                const groupsAfter = await getTabGroupsViaSW();
                expect(groupsAfter.length).toBeGreaterThanOrEqual(1);

                // Tabs to the right of anchor should be grouped; anchor itself should not
                const tabs = await getTabsViaSW();
                const anchorTab = tabs.find((t: any) => t.active);
                const rightTabs = tabs.filter((t: any) => t.index > (anchorTab?.index ?? -1));
                expect(rightTabs.length).toBe(2);
                rightTabs.forEach((t: any) => expect(t.groupId).toBeGreaterThan(0));
                expect(anchorTab?.groupId).toBe(-1);

                if (DEBUG) console.log(`tGne: groups=${groupsAfter.length}, right group IDs=${rightTabs.map((t: any) => t.groupId)}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/tGne/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/tGne/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });

    test('tGnd groups all same-domain tabs (SameDomain)', async () => {
        await withPersistedDualCoverage(
            { suiteLabel: SUITE_LABEL, coverageUrl: CONTENT_COVERAGE_URL, covBg, initContentCoverageForUrl },
            test.info().title,
            async () => {
                const anchor = await context.newPage();
                await anchor.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
                await closeAllExcept(anchor);

                // Same domain as anchor (localhost)
                const same1 = await context.newPage();
                await same1.goto(FIXTURE_URL, { waitUntil: 'load' });
                await same1.waitForTimeout(200);

                // Different domain: about:blank has empty hostname
                const different = await context.newPage();
                await different.goto('about:blank', { waitUntil: 'load' });
                await different.waitForTimeout(200);

                await anchor.bringToFront();
                await anchor.waitForTimeout(300);
                await ungroupAllViaSW();
                const covContent = await initContentCoverageForUrl?.(CONTENT_COVERAGE_URL);
                await covBg?.snapshot();
                await covContent?.snapshot();

                await callSKApi(anchor, 'unmapAllExcept', []);
                await callSKApi(anchor, 'mapcmdkey', KEY, UNIQUE_ID);
                await setConf(anchor, 'magicKeys', { 'd': 'SameDomain' });

                const groupsBefore = await getTabGroupsViaSW();
                expect(groupsBefore.length).toBe(0);

                await pressChord(anchor, 'd');

                const groupsAfter = await getTabGroupsViaSW();
                expect(groupsAfter.length).toBeGreaterThanOrEqual(1);

                // Verify: anchor + same1 (both localhost) are in the same group
                // different (about:blank, empty hostname) should not be grouped
                const tabs = await getTabsViaSW();
                const anchorTab = tabs.find((t: any) => t.active);
                const same1Tab = tabs.find((t: any) => !t.active && t.url?.includes('scroll-test.html') && !t.url?.includes('#'));
                const differentTab = tabs.find((t: any) => t.url === 'about:blank');

                expect(anchorTab?.groupId).toBeGreaterThan(0);
                if (same1Tab) {
                    expect(same1Tab.groupId).toBeGreaterThan(0);
                    expect(same1Tab.groupId).toBe(anchorTab?.groupId);
                }
                if (differentTab) {
                    expect(differentTab.groupId).toBe(-1);
                }

                if (DEBUG) console.log(`tGnd: groups=${groupsAfter.length}, anchorGroupId=${anchorTab?.groupId}, same1GroupId=${same1Tab?.groupId}, differentGroupId=${differentTab?.groupId}`);

                const bgPath = await covBg?.flush(`${SUITE_LABEL}/tGnd/command_window/background`) ?? null;
                const contentPath = await covContent?.flush(`${SUITE_LABEL}/tGnd/content`).catch(() => null) ?? null;
                if (process.env.COVERAGE === 'true') {
                    expect(bgPath).toBeTruthy();
                }
                await covContent?.close().catch(() => {});
            },
        );
    });
});
