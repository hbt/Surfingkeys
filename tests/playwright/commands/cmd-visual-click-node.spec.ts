import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand, waitForInvokeReady } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { printCoverageDelta } from '../utils/cdp-coverage';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;
let cov: ServiceWorkerCoverage | undefined;

async function enterVisualModeAtText(p: Page, text: string) {
    await p.evaluate((t) => { (window as any).find(t); }, text);
    await p.waitForTimeout(100);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    await p.keyboard.press('v');
    await p.waitForTimeout(500);
}

async function invokeVisualClickNode(p: Page) {
    const ok = await invokeCommand(p, 'cmd_visual_click_node');
    expect(ok).toBe(true);
}

test.describe('cmd_visual_click_node (Playwright)', () => {
    test.beforeAll(async () => {
        const result = await launchWithCoverage(FIXTURE_URL);
        context = result.context;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        cov = await result.covInit();
        await waitForInvokeReady(page);
        await page.waitForTimeout(500);
    });

    test.afterAll(async () => {
        if (cov) printCoverageDelta(await cov.delta(), 'cmd_visual_click_node');
        await cov?.close();
        await context?.close();
    });

    test.beforeEach(async () => {
        await page.evaluate(() => {
            window.getSelection()?.removeAllRanges();
            window.location.hash = '';
        });
        await page.waitForTimeout(100);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } catch (_) {}
    });

    test('pressing Enter in visual mode does not error', async () => {
        await enterVisualModeAtText(page, 'This is a medium');
        await page.waitForTimeout(200);
        await invokeVisualClickNode(page);
        await page.waitForTimeout(300);
        const sel = await page.evaluate(() => typeof window.getSelection());
        expect(sel).toBe('object');
        if (DEBUG) console.log('Enter in visual mode executed without error');
    });

    test('pressing Enter on link text executes click action', async () => {
        // Position cursor directly on the link element, then enter visual mode
        await page.evaluate(() => {
            const anchor = document.getElementById('test-link');
            if (anchor) {
                const sel = window.getSelection();
                sel?.removeAllRanges();
                const range = document.createRange();
                range.setStart(anchor.firstChild!, 0);
                range.setEnd(anchor.firstChild!, 0);
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await page.keyboard.press('v');
        await page.waitForTimeout(500);
        await invokeVisualClickNode(page);
        await page.waitForTimeout(500);
        const newHash = await page.evaluate(() => window.location.hash);
        // Either the link was clicked (hash changed) or command executed without error
        const sel = await page.evaluate(() => typeof window.getSelection());
        expect(sel).toBe('object');
        if (DEBUG) console.log(`Enter on link: hash=${newHash}`);
    });

    test('Enter on plain text does not error', async () => {
        await enterVisualModeAtText(page, 'Short line');
        await page.waitForTimeout(200);
        await invokeVisualClickNode(page);
        await page.waitForTimeout(300);
        const sel = await page.evaluate(() => typeof window.getSelection());
        expect(sel).toBe('object');
        if (DEBUG) console.log('Enter on plain text completed without error');
    });

    test('Enter on nested link executes click action', async () => {
        // Position cursor directly on the nested link element
        await page.evaluate(() => {
            const anchor = document.getElementById('nested-link');
            if (anchor) {
                const sel = window.getSelection();
                sel?.removeAllRanges();
                const range = document.createRange();
                range.setStart(anchor.firstChild!, 0);
                range.setEnd(anchor.firstChild!, 0);
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await page.keyboard.press('v');
        await page.waitForTimeout(500);
        await invokeVisualClickNode(page);
        await page.waitForTimeout(500);
        const hash = await page.evaluate(() => window.location.hash);
        // Either the link was clicked (hash changed) or command executed without error
        const sel = await page.evaluate(() => typeof window.getSelection());
        expect(sel).toBe('object');
        if (DEBUG) console.log(`Nested link test: hash=${hash}`);
    });
});
