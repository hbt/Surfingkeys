import { test } from '@playwright/test';
import { launchWithCoverage } from '../utils/pw-helpers';

test('is chrome.userScripts available in SW?', async () => {
    const { context, cov } = await launchWithCoverage();
    await new Promise(r => setTimeout(r, 2000));

    const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');

    const result = await sw.evaluate(() => {
        return {
            userScriptsType: typeof (chrome as any).userScripts,
            userScriptsDefined: !!(chrome as any).userScripts,
            isAvailable: (() => { try { return !!(chrome as any).userScripts; } catch { return false; } })(),
        };
    });

    console.log('\n[userScripts check]', JSON.stringify(result, null, 2));

    await cov?.close();
    await context.close();
});
