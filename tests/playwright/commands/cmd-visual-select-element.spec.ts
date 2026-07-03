import { test, expect, BrowserContext, Page } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';
import type { ServiceWorkerCoverage } from '../utils/cdp-coverage';
import { withPersistedDualCoverage } from '../utils/coverage-utils';

const DEBUG = !!process.env.DEBUG;

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const KEY = 'zv';
const UNIQUE_ID = 'cmd_visual_select_element';
const SUITE_LABEL = 'cmd_visual_select_element';
const FIXTURE_URL = `${FIXTURE_BASE}/visual-test.html`;

let context: BrowserContext;
let page: Page;
let covBg: ServiceWorkerCoverage | undefined;
let initContentCoverageForUrl: ((url: string) => Promise<ServiceWorkerCoverage | undefined>) | undefined;

test.describe('cmd_visual_select_element (Playwright)', () => {
    async function setConf(value: boolean): Promise<void> {
        await page.evaluate(([k, v]) => {
            document.dispatchEvent(new CustomEvent('__sk_conf_override', {
                detail: { key: k, value: v }
            }));
        }, ['FF_OPTIMIZE_ZZ', value] as [string, unknown]);
        await page.waitForTimeout(50);
    }

    async function fetchOtelLast(): Promise<any> {
        const resp = await page.request.get('http://localhost:9602/otel-last');
        return resp.json();
    }

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;
        covBg = result.covBg;
        initContentCoverageForUrl = result.covForPageUrl;
        page = await context.newPage();
        await page.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page.waitForTimeout(500);
    });

    test.beforeEach(async () => {
        await callSKApi(page, 'unmapAllExcept', []);
        await callSKApi(page, 'mapcmdkey', KEY, UNIQUE_ID);
    });

    test.afterEach(async () => {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        await page.waitForTimeout(100);
    });

    test.afterAll(async () => {
        await covBg?.close();
        await context?.close();
    });

    test('cmd_visual_select_element is invocable without error', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            // Select element under cursor in visual mode
            await page.mouse.click(100, 100);
            const ok = await invokeCommand(page, 'cmd_visual_select_element');
            if (DEBUG) console.log(`invokeCommand result: ${ok}`);
            expect(ok).toBe(true);
        });
    });

    test('cmd_visual_select_element works with FF_OPTIMIZE_ZZ disabled (revert path)', async () => {
        await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
            try {
                await setConf(false);
                await page.mouse.click(100, 100);
                const ok = await invokeCommand(page, 'cmd_visual_select_element');
                if (DEBUG) console.log(`invokeCommand (FF_OPTIMIZE_ZZ=false) result: ${ok}`);
                expect(ok).toBe(true);
            } finally {
                await setConf(true);
            }
        });
    });

    for (const flag of [true, false]) {
        test(`cmd_visual_select_element ships an otel span to the config server (FF_OPTIMIZE_ZZ=${flag})`, async () => {
            await withPersistedDualCoverage({ suiteLabel: SUITE_LABEL, coverageUrl: FIXTURE_URL, covBg, initContentCoverageForUrl }, test.info().title, async () => {
                try {
                    await setConf(flag);
                    await page.mouse.click(100, 100);
                    const ok = await invokeCommand(page, 'cmd_visual_select_element');
                    expect(ok).toBe(true);
                    await page.waitForTimeout(300); // allow the fire-and-forget /otel fetch to land

                    const span = await fetchOtelLast();
                    if (DEBUG) console.log(`otel span (FF_OPTIMIZE_ZZ=${flag}):`, JSON.stringify(span));

                    expect(span).not.toBeNull();
                    expect(span.name).toBe('zz.createHintsForTextNode');
                    expect(span.attributes.ffOptimizeZz).toBe(flag);
                    expect(typeof span.attributes.host).toBe('string');
                    expect(typeof span.attributes.hintCount).toBe('number');
                    expect(span.attributes.hintCount).toBeGreaterThan(0);
                    expect(span.events.some((e: any) => e.name === 'nodes.gathered')).toBe(true);
                    expect(span.endTimeUnixMs).toBeGreaterThanOrEqual(span.startTimeUnixMs);
                } finally {
                    await setConf(true);
                }
            });
        });
    }
});
