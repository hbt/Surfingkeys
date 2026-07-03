import { test, expect } from '@playwright/test';
import { launchWithCoverage, FIXTURE_BASE, invokeCommand } from '../utils/pw-helpers';

async function callSKApi(page: import('@playwright/test').Page, fn: string, ...args: unknown[]) {
    await page.evaluate(([f, a]: [string, unknown[]]) => {
        document.dispatchEvent(new CustomEvent('surfingkeys:api', {
            detail: [f, ...a], bubbles: true, composed: true,
        }));
    }, [fn, args] as [string, unknown[]]);
    await page.waitForTimeout(100);
}

const FIXTURE_URL = `${FIXTURE_BASE}/zz-selectionchange-stall.html`;

test.setTimeout(60_000);

test('zz calls getTextNodePos once per regex match before viewport filtering (repro)', async () => {
    const result = await launchWithCoverage(FIXTURE_URL);
    const context = result.context;
    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    page.on('console', (msg) => { if (msg.text().includes('Hints to click')) console.log('[console]', msg.text()); });

    await callSKApi(page, 'unmapAllExcept', []);
    await callSKApi(page, 'mapcmdkey', 'zv', 'cmd_visual_select_element');

    await page.mouse.click(50, 50);
    const start = Date.now();
    const ok = await invokeCommand(page, 'cmd_visual_select_element');
    const elapsed = Date.now() - start;

    const selectionChangeCount = await page.evaluate(() => (window as any).__selectionChangeCount);
    console.log(`elapsed=${elapsed}ms selectionChangeCount=${selectionChangeCount}`);
    const span = await (await page.request.get('http://localhost:9602/otel-last')).json();
    console.log('span:', JSON.stringify(span));

    expect(ok).toBe(true);
    // Confirms the mechanism seen in the real 70s stall: positions.built count (regex
    // matches) is far larger than nodes.gathered, and links.built runs getTextNodePos
    // once per position BEFORE viewport filtering discards most of them (598/202 final
    // hints here vs 2503 positions). Note: selectionChangeCount stayed at 2 regardless
    // of call volume (Chromium coalesces selectionchange per task, not per mutation),
    // and per-call cost did NOT reproduce the real page's ~26ms/call here (~0.03-0.04ms/call
    // on this synthetic fixture, even padded to a matching ~3000-element DOM) — whatever
    // made the real page's Selection/Range calls expensive (deep nesting, complex CSS,
    // custom fonts, etc.) is not reproduced by element count alone.
    expect(span.attributes.hintCount).toBeLessThan(span.events.find((e: any) => e.name === 'positions.built').attributes.count);
    expect(span.events.find((e: any) => e.name === 'positions.built').attributes.count).toBeGreaterThan(1000);

    await page.keyboard.press('Escape').catch(() => {});
    await context.close();
});
