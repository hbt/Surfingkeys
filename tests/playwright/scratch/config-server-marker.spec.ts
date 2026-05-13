import { test, expect } from '@playwright/test';
import { launchWithCoverage, invokeCommand, FIXTURE_BASE } from '../utils/pw-helpers';

const DEBUG = !!process.env.DEBUG;

const FIXTURE_URL = `${FIXTURE_BASE}/scroll-test.html`;

test('fixture config applied — cmd_config_server_test_marker registered', async () => {
    const { context, cov } = await launchWithCoverage();

    const page = await context.newPage();
    await page.goto(FIXTURE_URL, { waitUntil: 'load' });

    const userScriptRanOnFirstLoad = await page.waitForFunction(
        () => document.documentElement.dataset['skConfigServerLoaded'] === 'true',
        { timeout: 5000 },
    ).then(() => true).catch(() => false);

    if (!userScriptRanOnFirstLoad) {
        if (DEBUG) console.log('\n[fixture applied] user script not seen on first load — reloading');
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(
            () => document.documentElement.dataset['skConfigServerLoaded'] === 'true',
            { timeout: 15000 },
        );
    }

    const ok = await invokeCommand(page, 'cmd_config_server_test_marker');
    if (DEBUG) console.log(`\n[fixture applied] cmd_config_server_test_marker invokable: ${ok}`);

    await cov?.close();
    await context.close();

    expect(ok, 'fixture config marker command should be registered').toBe(true);
});
