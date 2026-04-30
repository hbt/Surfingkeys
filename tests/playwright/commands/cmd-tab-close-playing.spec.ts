import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { coverageSlug, readCoverageStats } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

const SUITE_LABEL = 'cmd_tab_close_playing';
const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const AUDIO_FIXTURE_URL = `${FIXTURE_BASE}/audio-test.html`;
const CONTENT_COVERAGE_URL = `${FIXTURE_URL}#cov_content_anchor`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

function assertBasicCoverage(
    bgPath: string | null,
    contentPath: string | null,
    opts?: { expectedBackgroundFunctions?: string[]; requireContent?: boolean },
): void {
    expect(bgPath).toBeTruthy();
    if (bgPath) {
        const bg = readCoverageStats(bgPath, 'service_worker', 'background.js');
        expect(bg.total).toBeGreaterThan(0);
        expect(bg.zero).toBeGreaterThan(0);
        expect(bg.gt0).toBeGreaterThan(0);
        for (const fn of opts?.expectedBackgroundFunctions ?? []) {
            expect(bg.byFunction.get(fn) ?? 0).toBeGreaterThan(0);
        }
    }

    if (opts?.requireContent !== false) {
        expect(contentPath).toBeTruthy();
    }
    if (contentPath) {
        const content = readCoverageStats(contentPath, 'page', 'content.js');
        expect(content.total).toBeGreaterThan(0);
        expect(content.zero).toBeGreaterThan(0);
        expect(content.gt0).toBeGreaterThan(0);
    }
}

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
        });
    });
}


async function getAudibleTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ audible: true, currentWindow: true }, (tabs: any[]) => resolve(tabs));
        });
    });
}

test.describe('cmd_tab_close_playing (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(CONTENT_COVERAGE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(CONTENT_COVERAGE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('gxp when no tab is audible does nothing', async () => {
        // Navigate page to a unique coverage URL
        const noAudibleUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxp_when_no_tab_is_audible_does_nothing`)}`;
        await page.goto(noAudibleUrl, { waitUntil: 'load' });
        await page.waitForTimeout(200);
        await page.bringToFront();
        await page.waitForTimeout(200);
        const covContent = await initContentCoverageForUrl?.(noAudibleUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 1`);
        }

        const audibleBefore = await getAudibleTabsViaSW(context);
        expect(audibleBefore.length).toBe(0);

        const initialTab = await getActiveTabViaSW(context);
        const beforeCount = context.pages().length;

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('x');
        await page.waitForTimeout(50);
        await page.keyboard.press('p').catch(() => {});
        await page.waitForTimeout(500);

        const afterTab = await getActiveTabViaSW(context);
        expect(afterTab.id).toBe(initialTab.id);
        expect(context.pages().length).toBe(beforeCount);
        if (DEBUG) console.log(`gxp no audible: count unchanged at ${beforeCount}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        if (covBg) await covBg.flush(`${label}/command_window/background`);
        if (covContent) await covContent.flush(`${label}/content`);
        await covContent?.close();
    });

    test('gxp closes an audible tab when one exists (may skip in headless)', async () => {
        // Open audio fixture page
        const audioPage = await context.newPage();
        await audioPage.goto(AUDIO_FIXTURE_URL, { waitUntil: 'load' });
        await audioPage.waitForTimeout(500);

        // Try to start audio
        const started = await audioPage.evaluate(() => {
            const w = window as any;
            if (w.audioTest && typeof w.audioTest.play === 'function') {
                return w.audioTest.play().then(() => true).catch(() => false);
            }
            return false;
        });
        if (DEBUG) console.log(`Audio started: ${started}`);

        // Wait up to 3s for Chrome to mark tab as audible
        let audibleTabs: any[] = [];
        for (let i = 0; i < 30; i++) {
            await page.waitForTimeout(100);
            audibleTabs = await getAudibleTabsViaSW(context);
            if (audibleTabs.length > 0) break;
        }

        if (audibleTabs.length === 0) {
            if (DEBUG) console.log('SKIP: No audible tabs detected (expected in headless Chrome without audio hardware)');
            await audioPage.close().catch(() => {});
            return;
        }

        // Navigate to a unique coverage URL on the active page before issuing gxp
        const gxpActiveUrl = `${FIXTURE_URL}#${coverageSlug(`${SUITE_LABEL}/gxp_closes_an_audible_tab_when_one_exists`)}`;
        await page.goto(gxpActiveUrl, { waitUntil: 'load' });
        await page.waitForTimeout(200);

        // We have an audible tab — switch to non-audio page and press gxp
        await page.bringToFront();
        await page.waitForTimeout(300);
        const covContent = await initContentCoverageForUrl?.(gxpActiveUrl);
        if (process.env.COVERAGE === 'true' && !covContent) {
            throw new Error(`Content coverage session failed to initialize for ${SUITE_LABEL} test 2`);
        }

        const beforeCount = context.pages().length;

        // Command window starts here.
        await covBg?.snapshot();
        await covContent?.snapshot();

        const closePromise = audioPage.waitForEvent('close');
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('x');
        await page.waitForTimeout(50);
        await page.keyboard.press('p').catch(() => {});
        await closePromise;

        expect(context.pages().length).toBe(beforeCount - 1);
        if (DEBUG) console.log(`gxp closed audible tab: ${beforeCount} → ${context.pages().length}`);

        const label = `${SUITE_LABEL}/${coverageSlug(test.info().title)}`;
        const bgPath = await covBg?.flush(`${label}/command_window/background`) ?? null;
        const contentPath = await covContent?.flush(`${label}/content`) ?? null;
        assertBasicCoverage(bgPath, contentPath);
        await covContent?.close();
    });
});
