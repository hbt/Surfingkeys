import { test, expect } from '@playwright/test';
import { launchExtensionContext, FIXTURE_BASE } from '../utils/pw-helpers';

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

test('title index prefix is applied exactly once — no infinite loop', async () => {
    const { context } = await launchExtensionContext();

    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(2000); // give loop time to manifest if bug present

    const title = await page.title();
    console.log('Page title after 2s:', JSON.stringify(title));

    const match = title.match(/^\[(\d+)\]/);
    expect(match, `title should start with [N] prefix, got: "${title}"`).toBeTruthy();

    const prefixCount = (title.match(/\[\d+\]/g) || []).length;
    console.log(`[N] prefix count: ${prefixCount}`);
    expect(prefixCount, `title "${title}" has ${prefixCount} index prefix(es) — expected exactly 1`).toBe(1);

    await context.close();
});
