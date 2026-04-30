import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;
const AUDIO_FIXTURE_URL = `${FIXTURE_BASE}/audio-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function getActiveTabViaSW(ctx: BrowserContext): Promise<any> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any>((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs[0] ?? null));
        });
    });
}

async function getTabsViaSW(ctx: BrowserContext): Promise<any[]> {
    const sw = ctx.serviceWorkers()[0];
    if (!sw) throw new Error('No service worker found');
    return sw.evaluate(() => {
        return new Promise<any[]>((resolve) => {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => resolve(tabs));
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
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_tab_close_playing');
        await cov?.close();
        await context?.close();
    });

    test('gxp when no tab is audible does nothing', async () => {
        // Ensure we are on a non-audio page
        await page.bringToFront();
        await page.waitForTimeout(200);

        const audibleBefore = await getAudibleTabsViaSW(context);
        expect(audibleBefore.length).toBe(0);

        const initialTab = await getActiveTabViaSW(context);
        const beforeCount = context.pages().length;

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

        // We have an audible tab — switch to non-audio page and press gxp
        await page.bringToFront();
        await page.waitForTimeout(300);

        const beforeCount = context.pages().length;

        const closePromise = audioPage.waitForEvent('close');
        await page.keyboard.press('g');
        await page.waitForTimeout(50);
        await page.keyboard.press('x');
        await page.waitForTimeout(50);
        await page.keyboard.press('p').catch(() => {});
        await closePromise;

        expect(context.pages().length).toBe(beforeCount - 1);
        if (DEBUG) console.log(`gxp closed audible tab: ${beforeCount} → ${context.pages().length}`);
    });
});
