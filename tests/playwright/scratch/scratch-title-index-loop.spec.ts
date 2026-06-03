/**
 * Scratch test: reproduce infinite [N] prefix loop in _rebuildTitle()
 *
 * Bug: _rebuildTitle() sets skipObserver=true, then document.title=...,
 * then skipObserver=false synchronously. The MutationObserver fires AFTER
 * skipObserver is already false, so it captures the prefixed title as
 * originalTitle and prepends [N] again → infinite loop.
 *
 * Expected (broken): title grows "[1] [1] [1] Page Title" after a short wait
 * Expected (fixed):  title stays "[1] Page Title" forever
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchWithDualCoverage, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

let context: BrowserContext;
let page1: Page;
let page2: Page;

test.describe('scratch: title index loop reproduction', () => {
    test.setTimeout(20_000);

    test.beforeAll(async () => {
        const result = await launchWithDualCoverage(FIXTURE_URL);
        context = result.context;

        // page1: tab index 0 (no prefix)
        page1 = await context.newPage();
        await page1.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page1.waitForTimeout(500);

        // page2: tab index 1 → triggers _rebuildTitle() with MutationObserver
        page2 = await context.newPage();
        await page2.goto(FIXTURE_URL, { waitUntil: 'load' });
        await page2.waitForTimeout(500);
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test('title on tab 2 should be "[1] <title>" — not repeating', async () => {
        // Give the MutationObserver loop time to run if the bug is present
        await page2.waitForTimeout(1000);

        const title = await page2.title();
        console.log('Tab 2 title after 1s:', JSON.stringify(title));

        // Bug manifests as repeated "[1] [1] [1] ..." prefix
        const prefixCount = (title.match(/\[1\]/g) || []).length;
        console.log('Prefix [1] count:', prefixCount);

        // With the bug: prefixCount > 1 (grows rapidly)
        // With the fix: prefixCount === 1
        expect(prefixCount, `Title "${title}" has ${prefixCount} occurrences of [1] — expected exactly 1`).toBe(1);
    });
});
